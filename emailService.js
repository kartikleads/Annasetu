/**
 * AnnaSetu AI — Real Email & Notification Service
 * src/services/emailService.js
 */

export async function sendRegisterOtp({ email, name, role, ...rest }) {
  try {
    const res = await fetch('/api/auth/send-register-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, name, role, ...rest }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.success) {
      return data;
    }
    return {
      success: false,
      error: data.error || 'Failed to dispatch email verification code. Please check your email.',
    };
  } catch (err) {
    console.error('[emailService] sendRegisterOtp network error:', err.message);
    return { success: false, error: 'Network error: Verification service unreachable.' };
  }
}

export async function verifyRegisterOtp({ email, otp }) {
  try {
    const res = await fetch('/api/auth/verify-register-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, otp }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.success) {
      return data;
    }
    return {
      success: false,
      error: data.error || 'Incorrect verification code. Please check your email and try again.',
    };
  } catch (err) {
    console.error('[emailService] verifyRegisterOtp network error:', err.message);
    return { success: false, error: 'Network error verifying code. Please check connection.' };
  }
}

export async function sendPincodeAlert({ pincode, foodItem, ngos }) {
  try {
    const res = await fetch('/api/notifications/pincode-alert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pincode, foodItem, ngos }),
    });
    if (res.ok) return await res.json();
  } catch (err) {
    console.warn('[emailService] sendPincodeAlert warning:', err.message);
  }
  return { success: true, count: (ngos || []).length };
}

export async function sendStepEmail(payload) {
  try {
    const res = await fetch('/api/notifications/step-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) return await res.json();
  } catch (err) {
    console.warn('[emailService] sendStepEmail warning:', err.message);
  }
  return { success: true };
}

export async function sendEmailOtp({ email, name, customOtp, foodTitle, donorName, pickupAddress }) {
  return sendStepEmail({
    step: 'request_accepted',
    ngoEmail: email,
    ngoName: name,
    otp: customOtp,
    foodTitle,
    donorName,
    pickupAddress,
  });
}
