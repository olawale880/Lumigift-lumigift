//! Lumigift Escrow Contract
//!
//! Locks USDC for a recipient until a predetermined timestamp.
//! Only the designated recipient can claim after the unlock time.
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
    UnlockNotExtended  = 8,
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
}

// ─── Contract ─────────────────────────────────────────────────────────────────

#[contract]
pub struct EscrowContract;

#[contractimpl]
impl EscrowContract {
    /// Initialize the escrow. Called once by the platform after deploying.
    pub fn initialize(
        env: Env,
        sender: Address,
        recipient: Address,
        token: Address,
        amount: i128,
        unlock_time: u64,
    ) -> Result<(), EscrowError> {
        if env.storage().instance().has(&DataKey::Sender) {
            return Err(EscrowError::AlreadyInitialized);
        }

        if amount < MIN_AMOUNT {
            return Err(EscrowError::InvalidAmount);
        }

        // Reject any token that is not the expected USDC contract
        if token != expected_usdc {
            panic!("token must be the USDC contract");
        }

        sender.require_auth();

        env.storage().instance().set(&DataKey::Sender, &sender);
        env.storage().instance().set(&DataKey::Recipient, &recipient);
        env.storage().instance().set(&DataKey::Token, &token);
        env.storage().instance().set(&DataKey::Amount, &amount);
        env.storage().instance().set(&DataKey::UnlockTime, &unlock_time);
        env.storage().instance().set(&DataKey::Claimed, &false);

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

        let claimed: bool = env
            .storage()
            .instance()
            .get(&DataKey::Claimed)
            .unwrap_or(false);

        if claimed {
            return Err(EscrowError::AlreadyClaimed);
        }

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

        env.storage().instance().set(&DataKey::Claimed, &true);

        let token_client = token::Client::new(&env, &token);
        token_client.transfer(&env.current_contract_address(), &recipient, &amount);

        env.events().publish(
            (Symbol::new(&env, "claimed"),),
            (recipient, amount),
        );

        Ok(())
    }

    /// Read-only: returns (recipient, amount, unlock_time, claimed).
    pub fn get_state(env: Env) -> Result<(Address, i128, u64, bool), EscrowError> {
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

        Ok((recipient, amount, unlock_time, claimed))
    }

    /// Extend the unlock date. Only the original sender may call this,
    /// and `new_unlock_at` must be strictly later than the current unlock time.
    pub fn extend_unlock(env: Env, new_unlock_at: u64) -> Result<(), EscrowError> {
        let sender: Address = env
            .storage()
            .instance()
            .get(&DataKey::Sender)
            .ok_or(EscrowError::NotInitialized)?;

        sender.require_auth();

        let claimed: bool = env
            .storage()
            .instance()
            .get(&DataKey::Claimed)
            .unwrap_or(false);

        if claimed {
            return Err(EscrowError::AlreadyClaimed);
        }

        let current_unlock: u64 = env
            .storage()
            .instance()
            .get(&DataKey::UnlockTime)
            .ok_or(EscrowError::NotInitialized)?;

        if new_unlock_at <= current_unlock {
            return Err(EscrowError::UnlockNotExtended);
        }

        env.storage().instance().set(&DataKey::UnlockTime, &new_unlock_at);

        env.events().publish(
            (Symbol::new(&env, "unlock_extended"),),
            (sender, current_unlock, new_unlock_at),
        );

        Ok(())
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

        client.initialize(&sender, &recipient, &token_id, &100_000_000, &1_000);
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

        client.initialize(&sender, &recipient, &token_id, &100_000_000, &1_000);

        let err = client
            .try_initialize(&sender, &recipient, &token_id, &100_000_000, &1_000)
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

        client.initialize(&sender, &recipient, &token_id, &100_000_000, &9_999_999);

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

        client.initialize(&sender, &recipient, &token_id, &100_000_000, &1_000);
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
            .try_initialize(&sender, &recipient, &token_id, &0, &1_000)
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

        // 9_999_999 stroops = just under 1 USDC minimum
        let err = client
            .try_initialize(&sender, &recipient, &token_id, &9_999_999, &1_000)
            .unwrap_err()
            .unwrap();
        assert_eq!(err, EscrowError::InvalidAmount);
    }

    #[test]
    fn test_extend_unlock_valid() {
        let env = Env::default();
        env.mock_all_auths();

        let sender = Address::generate(&env);
        let recipient = Address::generate(&env);
        let (token_id, _, token_admin) = create_token(&env, &sender);
        token_admin.mint(&sender, &100_000_000);

        let contract_id = env.register_contract(None, EscrowContract);
        let client = EscrowContractClient::new(&env, &contract_id);

        client.initialize(&sender, &recipient, &token_id, &100_000_000, &1_000);
        client.extend_unlock(&2_000);

        let (_, _, unlock_time, _) = client.get_state();
        assert_eq!(unlock_time, 2_000);
    }

    #[test]
    fn test_extend_unlock_same_time_returns_error() {
        let env = Env::default();
        env.mock_all_auths();

        let sender = Address::generate(&env);
        let recipient = Address::generate(&env);
        let (token_id, _, token_admin) = create_token(&env, &sender);
        token_admin.mint(&sender, &100_000_000);

        let contract_id = env.register_contract(None, EscrowContract);
        let client = EscrowContractClient::new(&env, &contract_id);

        client.initialize(&sender, &recipient, &token_id, &100_000_000, &1_000);

        let err = client.try_extend_unlock(&1_000).unwrap_err().unwrap();
        assert_eq!(err, EscrowError::UnlockNotExtended);
    }

    #[test]
    fn test_extend_unlock_earlier_time_returns_error() {
        let env = Env::default();
        env.mock_all_auths();

        let sender = Address::generate(&env);
        let recipient = Address::generate(&env);
        let (token_id, _, token_admin) = create_token(&env, &sender);
        token_admin.mint(&sender, &100_000_000);

        let contract_id = env.register_contract(None, EscrowContract);
        let client = EscrowContractClient::new(&env, &contract_id);

        client.initialize(&sender, &recipient, &token_id, &100_000_000, &1_000);

        let err = client.try_extend_unlock(&500).unwrap_err().unwrap();
        assert_eq!(err, EscrowError::UnlockNotExtended);
    }

    #[test]
    fn test_extend_unlock_after_claim_returns_error() {
        let env = Env::default();
        env.mock_all_auths();

        let sender = Address::generate(&env);
        let recipient = Address::generate(&env);
        let (token_id, _, token_admin) = create_token(&env, &sender);
        token_admin.mint(&sender, &100_000_000);

        let contract_id = env.register_contract(None, EscrowContract);
        let client = EscrowContractClient::new(&env, &contract_id);

        client.initialize(&sender, &recipient, &token_id, &100_000_000, &1_000);
        env.ledger().with_mut(|l| l.timestamp = 1_001);
        client.claim();

        let err = client.try_extend_unlock(&2_000).unwrap_err().unwrap();
        assert_eq!(err, EscrowError::AlreadyClaimed);
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
        fn fuzz_initialize_amount(amount in i128::MIN..=i128::MAX, unlock_time in 0u64..=u64::MAX) {
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

            let result = client.try_initialize(&sender, &recipient, &token_id, &amount, &unlock_time);

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

            client.initialize(&sender, &recipient, &token_id, &amount, &unlock_time);

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

    #[test]
    #[should_panic(expected = "token must be the USDC contract")]
    fn test_initialize_rejects_non_usdc_token() {
        let env = Env::default();
        env.mock_all_auths();

        let sender = Address::generate(&env);
        let recipient = Address::generate(&env);

        // Create two distinct token contracts: one "USDC", one fake
        let (usdc_id, _, usdc_admin) = create_token(&env, &sender);
        let (fake_id, _, fake_admin) = create_token(&env, &sender);

        usdc_admin.mint(&sender, &100_000_000);
        fake_admin.mint(&sender, &100_000_000);

        let contract_id = env.register_contract(None, EscrowContract);
        let client = EscrowContractClient::new(&env, &contract_id);

        // Pass fake token but declare usdc_id as the expected USDC — should panic
        client.initialize(&sender, &recipient, &fake_id, &100_000_000, &1_000, &usdc_id);
    }
}
