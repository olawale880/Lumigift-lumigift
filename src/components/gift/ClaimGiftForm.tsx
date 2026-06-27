"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { claimGiftSchema, type ClaimGiftInput } from "@/types/schemas";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useState } from "react";
import styles from "./ClaimGiftForm.module.css";

interface ClaimGiftFormProps {
  giftId: string;
}

export function ClaimGiftForm({ giftId }: ClaimGiftFormProps) {
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isValid },
  } = useForm<ClaimGiftInput>({
    resolver: zodResolver(claimGiftSchema),
    defaultValues: { giftId },
    mode: "onBlur",
  });

  const onSubmit = async (data: ClaimGiftInput) => {
    setLoading(true);
    setSubmitError(null);
    try {
      const res = await fetch(`/api/gifts/${data.giftId}/claim`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setTxHash(json.data.txHash);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to claim gift");
    } finally {
      setLoading(false);
    }
  };

  if (txHash) {
    return (
      <div className={styles.success} role="status" aria-live="polite">
        <p>🎉 Gift claimed successfully!</p>
        <p className={styles.txHash}>
          Transaction:{" "}
          <a
            href={`https://stellar.expert/explorer/testnet/tx/${txHash}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {txHash.slice(0, 16)}…
          </a>
        </p>
      </div>
    );
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit(onSubmit)} noValidate>
      <h2 className={styles.title}>Claim Your Gift</h2>

      {/* ARIA live region announces field errors to screen readers */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {errors.recipientStellarKey?.message ?? submitError ?? ""}
      </div>

      <Input
        label="Your Stellar Public Key"
        placeholder="G…"
        error={errors.recipientStellarKey?.message}
        autoComplete="off"
        {...register("recipientStellarKey")}
      />

      {submitError && (
        <p className={styles.error} role="alert">
          {submitError}
        </p>
      )}

      <Button type="submit" fullWidth loading={loading} disabled={!isValid || loading}>
        Claim Gift
      </Button>
    </form>
  );
}
// .