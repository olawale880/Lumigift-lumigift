import { getRedisClient } from "@/lib/redis";

const OTP_TTL = 600; // 10 minutes
const MAX_ATTEMPTS = 5;

export async function storeOtp(phone: string, otp: string): Promise<void> {
  const redis = await getRedisClient();
  await redis.set(`otp:${phone}`, otp, { EX: OTP_TTL });
  await redis.del(`otp:attempts:${phone}`);
}

export type VerifyResult =
  | { success: true }
  | { success: false; locked: boolean; message: string };

export async function verifyOtp(
  phone: string,
  otp: string
): Promise<VerifyResult> {
  const redis = await getRedisClient();
  const stored = await redis.get(`otp:${phone}`);

  if (!stored) {
    return { success: false, locked: false, message: "OTP expired or not found. Please request a new one." };
  }

  const attempts = await redis.incr(`otp:attempts:${phone}`);
  if (attempts === 1) {
    // Align attempts TTL with the OTP TTL
    const ttl = await redis.ttl(`otp:${phone}`);
    if (ttl > 0) await redis.expire(`otp:attempts:${phone}`, ttl);
  }

  if (attempts > MAX_ATTEMPTS) {
    await redis.del(`otp:${phone}`);
    return { success: false, locked: true, message: "Too many failed attempts. Please request a new OTP." };
  }

  if (otp !== stored) {
    if (attempts === MAX_ATTEMPTS) {
      await redis.del(`otp:${phone}`);
      return { success: false, locked: true, message: "Too many failed attempts. Please request a new OTP." };
    }
    return { success: false, locked: false, message: "Invalid OTP." };
  }

  // Success — clean up
  await Promise.all([
    redis.del(`otp:${phone}`),
    redis.del(`otp:attempts:${phone}`)
  ]);
  return { success: true };
}
