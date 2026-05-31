"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createGiftSchema, type CreateGiftInput } from "@/types/schemas";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useState } from "react";
import styles from "./CreateGiftForm.module.css";

export function CreateGiftForm() {
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isValid },
  } = useForm<CreateGiftInput>({
    resolver: zodResolver(createGiftSchema),
    defaultValues: { paymentProvider: "paystack" },
    mode: "onBlur",
  });

  const onSubmit = async (data: CreateGiftInput) => {
    setLoading(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/gifts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      window.location.href = json.data.paymentUrl;
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit(onSubmit)} noValidate>
      <h2 className={styles.title}>Send a Gift</h2>

      {/* ARIA live region announces field errors to screen readers */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {Object.values(errors)
          .map((e) => e?.message)
          .filter(Boolean)
          .join(". ")}
      </div>

      <Input
        label="Recipient's Name"
        placeholder="e.g. Amara"
        error={errors.recipientName?.message}
        {...register("recipientName")}
      />

      <Input
        label="Recipient's Phone"
        type="tel"
        placeholder="+2348012345678"
        error={errors.recipientPhone?.message}
        {...register("recipientPhone")}
      />

      <Input
        label="Gift Amount (₦)"
        type="number"
        placeholder="5000"
        min={500}
        error={errors.amountNgn?.message}
        {...register("amountNgn", { valueAsNumber: true })}
      />

      <Input
        label="Unlock Date & Time"
        type="datetime-local"
        error={errors.unlockAt?.message}
        {...register("unlockAt")}
      />

      <div className="input-group">
        <label className="input-label" htmlFor="message">
          Personal Message (optional)
        </label>
        <textarea
          id="message"
          className="input"
          rows={3}
          placeholder="Write something heartfelt…"
          {...register("message")}
        />
        {errors.message && (
          <span id="message-error" className="input-error-msg" role="alert">
            {errors.message.message}
          </span>
        )}
      </div>

      {submitError && (
        <p className={styles.error} role="alert">
          {submitError}
        </p>
      )}

      <Button type="submit" fullWidth loading={loading} disabled={!isValid || loading}>
        Continue to Payment
      </Button>
    </form>
  );
}
