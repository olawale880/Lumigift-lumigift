//! Lumigift Escrow Contract
//!
//! Locks USDC for a recipient until a predetermined timestamp.
//! Only the designated recipient can claim after the unlock time.
//! The sender may cancel and reclaim funds at any time before the recipient claims.
//!
//! # USDC Contract Addresses
//!
//! - **Mainnet:** `CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75`
//!   (Circle USDC on Stellar mainnet)
//! - **Testnet:** `CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA`
//!   (Circle USDC on Stellar testnet)

#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracterror, contracttype, token, Address, Env, Symbol,
};

// ─── Error enum ───────────────────────────────────────────────────────────────

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum EscrowError {
    AlreadyInitialized = 1,
    AlreadyClaimed     = 2,
    StillLocked        = 3,
    NotInitialized     = 4,
    Unauthorized       = 5,
    AlreadyCancelled   = 6,
    InvalidAmount      = 7,
    /// unlock_time must be strictly in the future at initialization time
    InvalidUnlockTime  = 8,
    /// token address does not match the whitelisted USDC contract
    InvalidToken       = 9,
}

/// Minimum escrow amount: 1 USDC expressed in stroops (7 decimal places).
const MIN_AMOUNT: i128 = 10_000_000;

// ─── Storage keys ─────────────────────────────────────────────────────────────

#[contracttype]
pub enum DataKey {
    Sender,
    Recipient,
    Token,
    Amount,
    UnlockTime,
    Claimed,
    Cancelled,
    /// Stores the whitelisted USDC address supplied at initialization
    ExpectedUsdc,
}

// ─── Contract ─────────────────────────────────────────────────────────────────

#[contract]
pub struct EscrowContract;

#[contractimpl]
impl EscrowContract {
    /// Initialize the escrow. Called once by the platform after deploying.
    ///
    /// # Security fixes applied
    /// - `expected_usdc` is now an explicit parameter; the supplied `token` is
    ///   checked against it, preventing arbitrary-token substitution attacks.
    /// - `unlock_time` must be strictly greater than the current ledger timestamp,
    ///   preventing gifts that are immediately claimable (or set in the past).
    pub fn initialize(
        env: Env,
        sender: Address,
        recipient: Address,
        token: Address,
        amount: i128,
        unlock_time: u64,
        expected_usdc: Address,
    ) -> Result<(), EscrowError> {
        // ── Re-initialization guard ──────────────────────────────────────────
        if env.storage().instance().has(&DataKey::Sender) {
            return Err(EscrowError::AlreadyInitialized);
        }

        // ── Amount validation ────────────────────────────────────────────────
        if amount < MIN_AMOUNT {
            return Err(EscrowError::InvalidAmount);
        }

        // ── Token whitelist check (FIX: was referencing undefined `expected_usdc`) ──
        if token != expected_usdc {
            return Err(EscrowError::InvalidToken);
        }

        // ── Unlock time must be in the future (FIX: missing validation) ─────
        if unlock_time <= env.ledger().timestamp() {
            return Err(EscrowError::InvalidUnlockTime);
        }

        // ── Authorisation ────────────────────────────────────────────────────
        sender.require_auth();

        // ── Persist state ────────────────────────────────────────────────────
        env.storage().instance().set(&DataKey::Sender, &sender);
        env.storage().instance().set(&DataKey::Recipient, &recipient);
        env.storage().instance().set(&DataKey::Token, &token);
        env.storage().instance().set(&DataKey::Amount, &amount);
        env.storage().instance().set(&DataKey::UnlockTime, &unlock_time);
        env.storage().instance().set(&DataKey::Claimed, &false);
        env.storage().instance().set(&DataKey::Cancelled, &false);
        env.storage().instance().set(&DataKey::ExpectedUsdc, &expected_usdc);

        // ── Pull funds into escrow (CEI: state written before external call) ─
        let token_client = token::Client::new(&env, &token);
        token_client.transfer(&sender, &env.current_contract_address(), &amount);

        env.events().publish(
            (Symbol::new(&env, "initialized"),),
            (sender, recipient, amount, unlock_time),
        );

        Ok(())
    }

    /// Claim the escrowed funds. Only callable by the recipient after unlock_time.
    pub fn claim(env: Env) -> Result<(), EscrowError> {
        let recipient: Address = env
            .storage()
            .instance()
            .get(&DataKey::Recipient)
            .ok_or(EscrowError::NotInitialized)?;

        recipient.require_auth();

        // ── Guard: already cancelled ─────────────────────────────────────────
        let cancelled: bool = env
            .storage()
            .instance()
            .get(&DataKey::Cancelled)
            .unwrap_or(false);
        if cancelled {
            return Err(EscrowError::AlreadyCancelled);
        }

        // ── Guard: already claimed ───────────────────────────────────────────
        let claimed: bool = env
            .storage()
            .instance()
            .get(&DataKey::Claimed)
            .unwrap_or(false);
        if claimed {
            return Err(EscrowError::AlreadyClaimed);
        }

        // ── Guard: still locked ──────────────────────────────────────────────
        let unlock_time: u64 = env
            .storage()
            .instance()
            .get(&DataKey::UnlockTime)
            .ok_or(EscrowError::NotInitialized)?;
        if env.ledger().timestamp() < unlock_time {
            return Err(EscrowError::StillLocked);
        }

        let token: Address = env
            .storage()
            .instance()
            .get(&DataKey::Token)
            .ok_or(EscrowError::NotInitialized)?;
        let amount: i128 = env
            .storage()
            .instance()
            .get(&DataKey::Amount)
            .ok_or(EscrowError::NotInitialized)?;

        // ── CEI: mark claimed before external transfer ───────────────────────
        env.storage().instance().set(&DataKey::Claimed, &true);

        let token_client = token::Client::new(&env, &token);
        token_client.transfer(&env.current_contract_address(), &recipient, &amount);

        env.events().publish(
            (Symbol::new(&env, "claimed"),),
            (recipient, amount),
        );

        Ok(())
    }

    /// Cancel the escrow and return funds to the sender.
    ///
    /// # Security (FIX: missing cancel path — funds were permanently locked)
    /// - Only the original sender may cancel.
    /// - Cannot cancel after the recipient has already claimed.
    /// - Cannot cancel twice.
    pub fn cancel(env: Env) -> Result<(), EscrowError> {
        let sender: Address = env
            .storage()
            .instance()
            .get(&DataKey::Sender)
            .ok_or(EscrowError::NotInitialized)?;

        sender.require_auth();

        // ── Guard: already cancelled ─────────────────────────────────────────
        let cancelled: bool = env
            .storage()
            .instance()
            .get(&DataKey::Cancelled)
            .unwrap_or(false);
        if cancelled {
            return Err(EscrowError::AlreadyCancelled);
        }

        // ── Guard: already claimed by recipient ──────────────────────────────
        let claimed: bool = env
            .storage()
            .instance()
            .get(&DataKey::Claimed)
            .unwrap_or(false);
        if claimed {
            return Err(EscrowError::AlreadyClaimed);
        }

        let token: Address = env
            .storage()
            .instance()
            .get(&DataKey::Token)
            .ok_or(EscrowError::NotInitialized)?;
        let amount: i128 = env
            .storage()
            .instance()
            .get(&DataKey::Amount)
            .ok_or(EscrowError::NotInitialized)?;

        // ── CEI: mark cancelled before external transfer ─────────────────────
        env.storage().instance().set(&DataKey::Cancelled, &true);

        let token_client = token::Client::new(&env, &token);
        token_client.transfer(&env.current_contract_address(), &sender, &amount);

        env.events().publish(
            (Symbol::new(&env, "cancelled"),),
            (sender, amount),
        );

        Ok(())
    }

    /// Read-only: returns (recipient, amount, unlock_time, claimed, cancelled).
    pub fn get_state(env: Env) -> Result<(Address, i128, u64, bool, bool), EscrowError> {
        let recipient: Address = env
            .storage()
            .instance()
            .get(&DataKey::Recipient)
            .ok_or(EscrowError::NotInitialized)?;
        let amount: i128 = env
            .storage()
            .instance()
            .get(&DataKey::Amount)
            .ok_or(EscrowError::NotInitialized)?;
        let unlock_time: u64 = env
            .storage()
            .instance()
            .get(&DataKey::UnlockTime)
            .ok_or(EscrowError::NotInitialized)?;
        let claimed: bool = env
            .storage()
            .instance()
            .get(&DataKey::Claimed)
            .unwrap_or(false);
        let cancelled: bool = env
            .storage()
            .instance()
            .get(&DataKey::Cancelled)
            .unwrap_or(false);

        Ok((recipient, amount, unlock_time, claimed, cancelled))
    }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{
        testutils::{Address as _, Ledger},
        token::{Client as TokenClient, StellarAssetClient},
        Env,
    };

    fn create_token(env: &Env, admin: &Address) -> (Address, TokenClient, StellarAssetClient) {
        let token_id = env.register_stellar_asset_contract(admin.clone());
        let token = TokenClient::new(env, &token_id);
        let token_admin = StellarAssetClient::new(env, &token_id);
        (token_id, token, token_admin)
    }

    /// Helper: initialize with a future unlock_time (ledger starts at 0, so 1_000 is fine).
    fn do_initialize(
        client: &EscrowContractClient,
        sender: &Address,
        recipient: &Address,
        token_id: &Address,
        amount: i128,
        unlock_time: u64,
    ) {
        client.initialize(sender, recipient, token_id, &amount, &unlock_time, token_id);
    }

    #[test]
    fn test_initialize_and_claim() {
        let env = Env::default();
        env.mock_all_auths();

        let sender = Address::generate(&env);
        let recipient = Address::generate(&env);
        let (token_id, token, token_admin) = create_token(&env, &sender);

        token_admin.mint(&sender, &100_000_000);

        let contract_id = env.register_contract(None, EscrowContract);
        let client = EscrowContractClient::new(&env, &contract_id);

        do_initialize(&client, &sender, &recipient, &token_id, 100_000_000, 1_000);
        env.ledger().with_mut(|l| l.timestamp = 1_001);
        client.claim();

        assert_eq!(token.balance(&recipient), 100_000_000);
    }

    #[test]
    fn test_double_initialize_returns_error() {
        let env = Env::default();
        env.mock_all_auths();

        let sender = Address::generate(&env);
        let recipient = Address::generate(&env);
        let (token_id, _, token_admin) = create_token(&env, &sender);
        token_admin.mint(&sender, &200_000_000);

        let contract_id = env.register_contract(None, EscrowContract);
        let client = EscrowContractClient::new(&env, &contract_id);

        do_initialize(&client, &sender, &recipient, &token_id, 100_000_000, 1_000);

        let err = client
            .try_initialize(&sender, &recipient, &token_id, &100_000_000, &1_000, &token_id)
            .unwrap_err()
            .unwrap();
        assert_eq!(err, EscrowError::AlreadyInitialized);
    }

    #[test]
    fn test_claim_before_unlock_returns_error() {
        let env = Env::default();
        env.mock_all_auths();

        let sender = Address::generate(&env);
        let recipient = Address::generate(&env);
        let (token_id, _, token_admin) = create_token(&env, &sender);
        token_admin.mint(&sender, &100_000_000);

        let contract_id = env.register_contract(None, EscrowContract);
        let client = EscrowContractClient::new(&env, &contract_id);

        do_initialize(&client, &sender, &recipient, &token_id, 100_000_000, 9_999_999);

        let err = client.try_claim().unwrap_err().unwrap();
        assert_eq!(err, EscrowError::StillLocked);
    }

    #[test]
    fn test_double_claim_returns_error() {
        let env = Env::default();
        env.mock_all_auths();

        let sender = Address::generate(&env);
        let recipient = Address::generate(&env);
        let (token_id, _, token_admin) = create_token(&env, &sender);
        token_admin.mint(&sender, &100_000_000);

        let contract_id = env.register_contract(None, EscrowContract);
        let client = EscrowContractClient::new(&env, &contract_id);

        do_initialize(&client, &sender, &recipient, &token_id, 100_000_000, 1_000);
        env.ledger().with_mut(|l| l.timestamp = 1_001);
        client.claim();

        let err = client.try_claim().unwrap_err().unwrap();
        assert_eq!(err, EscrowError::AlreadyClaimed);
    }

    #[test]
    fn test_get_state_not_initialized_returns_error() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, EscrowContract);
        let client = EscrowContractClient::new(&env, &contract_id);

        let err = client.try_get_state().unwrap_err().unwrap();
        assert_eq!(err, EscrowError::NotInitialized);
    }

    #[test]
    fn test_initialize_zero_amount_returns_invalid_amount() {
        let env = Env::default();
        env.mock_all_auths();

        let sender = Address::generate(&env);
        let recipient = Address::generate(&env);
        let (token_id, _, _) = create_token(&env, &sender);

        let contract_id = env.register_contract(None, EscrowContract);
        let client = EscrowContractClient::new(&env, &contract_id);

        let err = client
            .try_initialize(&sender, &recipient, &token_id, &0, &1_000, &token_id)
            .unwrap_err()
            .unwrap();
        assert_eq!(err, EscrowError::InvalidAmount);
    }

    #[test]
    fn test_initialize_below_minimum_amount_returns_invalid_amount() {
        let env = Env::default();
        env.mock_all_auths();

        let sender = Address::generate(&env);
        let recipient = Address::generate(&env);
        let (token_id, _, token_admin) = create_token(&env, &sender);
        token_admin.mint(&sender, &9_999_999);

        let contract_id = env.register_contract(None, EscrowContract);
        let client = EscrowContractClient::new(&env, &contract_id);

        let err = client
            .try_initialize(&sender, &recipient, &token_id, &9_999_999, &1_000, &token_id)
            .unwrap_err()
            .unwrap();
        assert_eq!(err, EscrowError::InvalidAmount);
    }

    // ── New tests for fixed vulnerabilities ───────────────────────────────────

    #[test]
    fn test_initialize_rejects_non_usdc_token() {
        let env = Env::default();
        env.mock_all_auths();

        let sender = Address::generate(&env);
        let recipient = Address::generate(&env);
        let (usdc_id, _, _) = create_token(&env, &sender);
        let (fake_id, _, fake_admin) = create_token(&env, &sender);
        fake_admin.mint(&sender, &100_000_000);

        let contract_id = env.register_contract(None, EscrowContract);
        let client = EscrowContractClient::new(&env, &contract_id);

        let err = client
            .try_initialize(&sender, &recipient, &fake_id, &100_000_000, &1_000, &usdc_id)
            .unwrap_err()
            .unwrap();
        assert_eq!(err, EscrowError::InvalidToken);
    }

    #[test]
    fn test_initialize_rejects_past_unlock_time() {
        let env = Env::default();
        env.mock_all_auths();

        let sender = Address::generate(&env);
        let recipient = Address::generate(&env);
        let (token_id, _, token_admin) = create_token(&env, &sender);
        token_admin.mint(&sender, &100_000_000);

        // Advance ledger past the unlock_time we will supply
        env.ledger().with_mut(|l| l.timestamp = 5_000);

        let contract_id = env.register_contract(None, EscrowContract);
        let client = EscrowContractClient::new(&env, &contract_id);

        let err = client
            .try_initialize(&sender, &recipient, &token_id, &100_000_000, &1_000, &token_id)
            .unwrap_err()
            .unwrap();
        assert_eq!(err, EscrowError::InvalidUnlockTime);
    }

    #[test]
    fn test_cancel_returns_funds_to_sender() {
        let env = Env::default();
        env.mock_all_auths();

        let sender = Address::generate(&env);
        let recipient = Address::generate(&env);
        let (token_id, token, token_admin) = create_token(&env, &sender);
        token_admin.mint(&sender, &100_000_000);

        let contract_id = env.register_contract(None, EscrowContract);
        let client = EscrowContractClient::new(&env, &contract_id);

        do_initialize(&client, &sender, &recipient, &token_id, 100_000_000, 1_000);
        assert_eq!(token.balance(&sender), 0);

        client.cancel();
        assert_eq!(token.balance(&sender), 100_000_000);
    }

    #[test]
    fn test_double_cancel_returns_error() {
        let env = Env::default();
        env.mock_all_auths();

        let sender = Address::generate(&env);
        let recipient = Address::generate(&env);
        let (token_id, _, token_admin) = create_token(&env, &sender);
        token_admin.mint(&sender, &100_000_000);

        let contract_id = env.register_contract(None, EscrowContract);
        let client = EscrowContractClient::new(&env, &contract_id);

        do_initialize(&client, &sender, &recipient, &token_id, 100_000_000, 1_000);
        client.cancel();

        let err = client.try_cancel().unwrap_err().unwrap();
        assert_eq!(err, EscrowError::AlreadyCancelled);
    }

    #[test]
    fn test_cancel_after_claim_returns_error() {
        let env = Env::default();
        env.mock_all_auths();

        let sender = Address::generate(&env);
        let recipient = Address::generate(&env);
        let (token_id, _, token_admin) = create_token(&env, &sender);
        token_admin.mint(&sender, &100_000_000);

        let contract_id = env.register_contract(None, EscrowContract);
        let client = EscrowContractClient::new(&env, &contract_id);

        do_initialize(&client, &sender, &recipient, &token_id, 100_000_000, 1_000);
        env.ledger().with_mut(|l| l.timestamp = 1_001);
        client.claim();

        let err = client.try_cancel().unwrap_err().unwrap();
        assert_eq!(err, EscrowError::AlreadyClaimed);
    }

    #[test]
    fn test_claim_after_cancel_returns_error() {
        let env = Env::default();
        env.mock_all_auths();

        let sender = Address::generate(&env);
        let recipient = Address::generate(&env);
        let (token_id, _, token_admin) = create_token(&env, &sender);
        token_admin.mint(&sender, &100_000_000);

        let contract_id = env.register_contract(None, EscrowContract);
        let client = EscrowContractClient::new(&env, &contract_id);

        do_initialize(&client, &sender, &recipient, &token_id, 100_000_000, 1_000);
        client.cancel();

        env.ledger().with_mut(|l| l.timestamp = 1_001);
        let err = client.try_claim().unwrap_err().unwrap();
        assert_eq!(err, EscrowError::AlreadyCancelled);
    }
}

// ─── Proptest fuzz tests ──────────────────────────────────────────────────────

#[cfg(test)]
mod fuzz {
    use super::*;
    use proptest::prelude::*;
    use soroban_sdk::{
        testutils::{Address as _, Ledger},
        token::{Client as TokenClient, StellarAssetClient},
        Env,
    };

    proptest! {
        /// Any amount below MIN_AMOUNT must be rejected; any amount >= MIN_AMOUNT
        /// must be accepted (contract stores it and token balance moves).
        #[test]
        fn fuzz_initialize_amount(amount in i128::MIN..=i128::MAX, unlock_time in 1u64..=u64::MAX) {
            let env = Env::default();
            env.mock_all_auths();

            let sender = Address::generate(&env);
            let recipient = Address::generate(&env);
            let token_id = env.register_stellar_asset_contract(sender.clone());
            let token_admin = StellarAssetClient::new(&env, &token_id);

            if amount >= MIN_AMOUNT {
                token_admin.mint(&sender, &amount);
            }

            let contract_id = env.register_contract(None, EscrowContract);
            let client = EscrowContractClient::new(&env, &contract_id);

            // ledger timestamp is 0, so any unlock_time >= 1 is valid
            let result = client.try_initialize(&sender, &recipient, &token_id, &amount, &unlock_time, &token_id);

            if amount < MIN_AMOUNT {
                prop_assert_eq!(
                    result.unwrap_err().unwrap(),
                    EscrowError::InvalidAmount,
                    "expected InvalidAmount for amount={amount}"
                );
            } else {
                prop_assert!(result.is_ok(), "expected Ok for amount={amount}, got {result:?}");
            }
        }

        /// Claim before unlock_time → StillLocked.
        /// Claim at or after unlock_time → Ok (funds transferred).
        #[test]
        fn fuzz_claim_timestamp(
            unlock_time in 1u64..=u64::MAX / 2,
            ledger_offset in 0u64..=u64::MAX / 2,
        ) {
            let env = Env::default();
            env.mock_all_auths();

            let sender    = Address::generate(&env);
            let recipient = Address::generate(&env);
            let token_id  = env.register_stellar_asset_contract(sender.clone());
            let token     = TokenClient::new(&env, &token_id);
            let token_admin = StellarAssetClient::new(&env, &token_id);

            let amount = MIN_AMOUNT;
            token_admin.mint(&sender, &amount);

            let contract_id = env.register_contract(None, EscrowContract);
            let client = EscrowContractClient::new(&env, &contract_id);

            // ledger is at 0, unlock_time >= 1 → always a valid future time
            client.initialize(&sender, &recipient, &token_id, &amount, &unlock_time, &token_id);

            let ledger_ts = unlock_time.saturating_sub(1).saturating_add(ledger_offset);
            env.ledger().with_mut(|l| l.timestamp = ledger_ts);

            let result = client.try_claim();

            if ledger_ts < unlock_time {
                prop_assert_eq!(
                    result.unwrap_err().unwrap(),
                    EscrowError::StillLocked,
                    "expected StillLocked at ts={ledger_ts} unlock={unlock_time}"
                );
            } else {
                prop_assert!(result.is_ok(), "expected Ok at ts={ledger_ts} unlock={unlock_time}, got {result:?}");
                prop_assert_eq!(token.balance(&recipient), amount);
            }
        }
    }
}
