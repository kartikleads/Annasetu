/**
 * AnnaSetu AI — Cloudflare Edge Worker Backend
 * src/worker.js
 */
import { connect } from 'cloudflare:sockets';

// In-memory fallback if KV is loading or during quick requests
const memoryStore = new Map();

function sendJson(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

function renderEmailTemplate({ headline, lead, bodyHtml, actionBox }) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0b1411; color: #e4ebe6; margin: 0; padding: 24px; }
        .card { background-color: #12211c; border: 1px solid #1f3d32; border-radius: 16px; max-width: 560px; margin: 0 auto; padding: 32px; box-shadow: 0 16px 36px rgba(0,0,0,0.4); }
        .brand { display: flex; align-items: center; gap: 8px; font-size: 20px; font-weight: 800; color: #ffffff; margin-bottom: 24px; }
        .asterisk { color: #22c55e; font-size: 24px; }
        h1 { font-size: 21px; font-weight: 700; color: #ffffff; margin-top: 0; margin-bottom: 12px; }
        p { color: #9ab3a5; font-size: 15px; line-height: 1.6; margin: 0 0 16px 0; }
        .action-box { background: linear-gradient(135deg, rgba(34,197,94,0.15), rgba(16,185,129,0.08)); border: 1.5px dashed #22c55e; border-radius: 12px; padding: 20px; text-align: center; margin: 24px 0; }
        .digits { font-size: 36px; font-weight: 800; letter-spacing: 6px; color: #4ade80; font-family: monospace; }
        .details-box { background-color: #162a23; border-radius: 8px; padding: 16px; margin: 20px 0; font-size: 14px; color: #c4d7cc; }
        .details-box div { margin-bottom: 8px; }
        .details-box div:last-child { margin-bottom: 0; }
        .footer { font-size: 12px; color: #627b6f; border-top: 1px solid #1f3d32; padding-top: 16px; margin-top: 24px; text-align: center; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="brand"><span class="asterisk">✳</span> AnnaSetu AI</div>
        <h1>${headline}</h1>
        <p>${lead}</p>
        ${actionBox ? `<div class="action-box">${actionBox}</div>` : ''}
        ${bodyHtml ? `<div class="details-box">${bodyHtml}</div>` : ''}
        <div class="footer">AnnaSetu AI · Hyperlocal Surplus Food Redistribution · Less waste. More hope.</div>
      </div>
    </body>
    </html>
  `;
}

async function sendWorkerSmtp({ smtpEmail, smtpPass, fromName, to, subject, html }) {
  if (!smtpEmail || !smtpPass) {
    console.warn(`[Worker SMTP] Skipped email to ${to}: Missing credentials.`);
    return { success: false, error: 'SMTP credentials not configured.' };
  }

  const socket = connect(
    { hostname: 'smtp.gmail.com', port: 465 },
    { secureTransport: 'on' }
  );

  const writer = socket.writable.getWriter();
  const reader = socket.readable.getReader();
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  let buffer = '';

  async function readResponse() {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\r\n');
      if (lines.length > 1) {
        const lastComplete = lines[lines.length - 2];
        if (/^\d{3} /.test(lastComplete) || /^\d{3}$/.test(lastComplete)) {
          const resp = buffer;
          buffer = lines[lines.length - 1];
          return resp;
        }
      }
    }
    return buffer;
  }

  async function sendCmd(cmd) {
    await writer.write(encoder.encode(cmd + '\r\n'));
    return await readResponse();
  }

  try {
    const greeting = await readResponse();
    if (!greeting.startsWith('220')) {
      throw new Error('Invalid SMTP banner: ' + greeting.trim());
    }

    const ehloResp = await sendCmd('EHLO localhost');
    if (!ehloResp.includes('250')) {
      throw new Error('EHLO rejected: ' + ehloResp.trim());
    }

    const authResp = await sendCmd('AUTH LOGIN');
    if (!authResp.includes('334')) {
      throw new Error('AUTH LOGIN rejected: ' + authResp.trim());
    }

    const userResp = await sendCmd(btoa(smtpEmail));
    if (!userResp.includes('334')) {
      throw new Error('Username rejected: ' + userResp.trim());
    }

    const cleanPass = smtpPass.replace(/["'\s]/g, '');
    const passResp = await sendCmd(btoa(cleanPass));
    if (!passResp.includes('235')) {
      throw new Error('Password rejected: ' + passResp.trim());
    }

    const mailFromResp = await sendCmd(`MAIL FROM:<${smtpEmail}>`);
    if (!mailFromResp.includes('250')) {
      throw new Error('MAIL FROM rejected: ' + mailFromResp.trim());
    }

    const rcptResp = await sendCmd(`RCPT TO:<${to}>`);
    if (!rcptResp.includes('250')) {
      throw new Error('RCPT TO rejected: ' + rcptResp.trim());
    }

    const dataResp = await sendCmd('DATA');
    if (!dataResp.includes('354')) {
      throw new Error('DATA rejected: ' + dataResp.trim());
    }

    const emailData = [
      `From: "${fromName}" <${smtpEmail}>`,
      `To: <${to}>`,
      `Subject: ${subject}`,
      'MIME-Version: 1.0',
      'Content-Type: text/html; charset=UTF-8',
      '',
      html,
      '',
      '.',
      '',
    ].join('\r\n');

    await writer.write(encoder.encode(emailData));
    const finalResp = await readResponse();
    if (!finalResp.includes('250')) {
      throw new Error('Message submission failed: ' + finalResp.trim());
    }

    await sendCmd('QUIT');
    console.log(`[Worker SMTP] Successfully delivered email to ${to} (${subject})`);
    return { success: true };
  } catch (err) {
    console.error(`[Worker SMTP] Failed sending to ${to}:`, err.message);
    return { success: false, error: err.message };
  } finally {
    try {
      writer.releaseLock();
      reader.releaseLock();
      await socket.close();
    } catch {
      // ignore
    }
  }
}

function computeFssaiSafetyStandards(category, prepTime, storageCondition) {
  const isHighRisk =
    category?.toLowerCase().includes('non-veg') ||
    category?.toLowerCase().includes('meat') ||
    category?.toLowerCase().includes('dairy');

  const isAmbient =
    storageCondition?.toLowerCase().includes('ambient') ||
    storageCondition?.toLowerCase().includes('room');

  const isCold = storageCondition?.toLowerCase().includes('refrigerat');
  const isHot =
    storageCondition?.toLowerCase().includes('heated') ||
    storageCondition?.toLowerCase().includes('>60');

  if (isHighRisk && isAmbient) {
    return {
      safetyRisk: 'High',
      safetyScore: 65,
      isSuitable: true,
      maxSafeHours: 2,
      priorityLevel: 'Critical',
      handlingAdvice: 'Perishable proteins at ambient room temperature must be consumed within 2 hours.',
      rationale: 'FSSAI Danger Zone rule (5°C to 60°C rapid bacterial growth threshold).',
    };
  }

  if (isCold) {
    return {
      safetyRisk: 'Low',
      safetyScore: 98,
      isSuitable: true,
      maxSafeHours: 8,
      priorityLevel: 'Normal',
      handlingAdvice: 'Maintain active cold-chain below 5°C throughout transit.',
      rationale: 'Cold holding retards bacterial reproduction conforming to safe storage norms.',
    };
  }

  if (isHot) {
    return {
      safetyRisk: 'Low',
      safetyScore: 95,
      isSuitable: true,
      maxSafeHours: 4,
      priorityLevel: 'Normal',
      handlingAdvice: 'Keep lids tightly sealed and insulated above 60°C until distribution.',
      rationale: 'Hot holding above 60°C prevents pathogen proliferation.',
    };
  }

  return {
    safetyRisk: 'Low',
    safetyScore: 92,
    isSuitable: true,
    maxSafeHours: 4,
    priorityLevel: 'Normal',
    handlingAdvice: 'Transport in clean, insulated food-grade containers.',
    rationale: 'Batch complies with standard cooked food consumption timeframe.',
  };
}

export default {
  async fetch(request, env, _ctx) {
    const url = new URL(request.url);

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
      });
    }

    // SMTP Credentials from Worker Environment
    const smtpEmail = (env.SMTP_EMAIL || 'annasetu0@gmail.com').trim();
    const smtpPass = (env.SMTP_APP_PASSWORD || 'afnb fgho kujj fsbo').replace(/["']/g, '').trim();
    const fromName = (env.SMTP_FROM_NAME || 'AnnaSetu AI').replace(/["']/g, '').trim();

    // 1. Status Check
    if (url.pathname === '/api/status' && request.method === 'GET') {
      return sendJson({
        status: 'online',
        hasKv: Boolean(env.ANNASETU_KV),
        smtpConfigured: Boolean(smtpEmail && smtpPass),
        safetyEngine: 'Deterministic FSSAI Safe Food Standards (Zero AI Dependency)',
      });
    }

    // 2. Auth: Send 6-Digit Email Verification Code
    if (url.pathname === '/api/auth/send-register-otp' && request.method === 'POST') {
      try {
        const body = await request.json();
        const email = (body.email || '').trim().toLowerCase();
        const name = (body.name || 'User').trim();
        const role = body.role || 'donor';

        if (!email || !email.includes('@')) {
          return sendJson({ success: false, error: 'Valid email address is required.' }, 400);
        }

        const otp = String(Math.floor(100000 + Math.random() * 900000));
        const expiresAt = Date.now() + 15 * 60 * 1000; // 15 mins

        const record = { otp, expiresAt, verified: false, name, role, userPayload: body };

        // Save in KV and in-memory
        if (env.ANNASETU_KV) {
          await env.ANNASETU_KV.put(`otp:${email}`, JSON.stringify(record), {
            expirationTtl: 900,
          });
        }
        memoryStore.set(`otp:${email}`, record);

        const html = renderEmailTemplate({
          headline: 'Verify Your Email · AnnaSetu AI Account Activation',
          lead: `Hello <strong>${name}</strong>, thank you for joining AnnaSetu AI as a verified <strong>${role === 'donor' ? 'Food Donor' : 'Rescue NGO'}</strong>. Use the 6-digit activation code below to verify your email address:`,
          actionBox: `<div class="digits">${otp}</div><div style="font-size:12px;color:#86efac;margin-top:6px;">Valid for 15 minutes · Single-use activation code</div>`,
        });

        const mailResult = await sendWorkerSmtp({
          smtpEmail,
          smtpPass,
          fromName,
          to: email,
          subject: `[AnnaSetu AI] Your 6-Digit Email Verification Code: ${otp}`,
          html,
        });

        if (!mailResult.success) {
          return sendJson({
            success: false,
            error: `Failed to dispatch email to ${email}: ${mailResult.error || 'SMTP delivery error'}. Please verify email address.`,
          }, 500);
        }

        return sendJson({
          success: true,
          message: `Verification code sent to ${email}`,
        });
      } catch (err) {
        return sendJson({ success: false, error: err.message }, 500);
      }
    }

    // 3. Auth: Verify 6-Digit Registration OTP
    if (url.pathname === '/api/auth/verify-register-otp' && request.method === 'POST') {
      try {
        const body = await request.json();
        const email = (body.email || '').trim().toLowerCase();
        const otp = (body.otp || '').trim();

        if (!email || !otp) {
          return sendJson({ success: false, error: 'Email and verification code are required.' }, 400);
        }

        let record = null;
        if (env.ANNASETU_KV) {
          const raw = await env.ANNASETU_KV.get(`otp:${email}`);
          if (raw) {
            try { record = JSON.parse(raw); } catch {}
          }
        }
        if (!record) {
          record = memoryStore.get(`otp:${email}`);
        }

        if (!record) {
          return sendJson({
            success: false,
            error: 'No active verification code found for this email. Please request a new code.',
          }, 400);
        }

        if (Date.now() > record.expiresAt) {
          if (env.ANNASETU_KV) await env.ANNASETU_KV.delete(`otp:${email}`);
          memoryStore.delete(`otp:${email}`);
          return sendJson({
            success: false,
            error: 'This verification code has expired. Please request a new one.',
          }, 400);
        }

        // STRICT MATCHING — No backdoors, no 123456 bypass
        if (record.otp !== otp) {
          return sendJson({
            success: false,
            error: 'Incorrect verification code. Please check your email and try again.',
          }, 400);
        }

        record.verified = true;
        if (env.ANNASETU_KV) {
          await env.ANNASETU_KV.delete(`otp:${email}`);
        }
        memoryStore.delete(`otp:${email}`);

        return sendJson({
          success: true,
          message: 'Email successfully verified! Your account is active.',
          user: record.userPayload,
        });
      } catch (err) {
        return sendJson({ success: false, error: err.message }, 500);
      }
    }

    // 4. Shared Foods API (GET / POST for Cross-Device Persistence)
    if (url.pathname === '/api/foods') {
      if (request.method === 'GET') {
        let foods = [];
        if (env.ANNASETU_KV) {
          const raw = await env.ANNASETU_KV.get('annasetu:foods');
          if (raw) {
            try { foods = JSON.parse(raw); } catch {}
          }
        }
        if (!foods || foods.length === 0) {
          foods = memoryStore.get('annasetu:foods') || [];
        }
        return sendJson({ success: true, foods });
      }

      if (request.method === 'POST') {
        try {
          const body = await request.json();
          const foods = Array.isArray(body.foods) ? body.foods : (Array.isArray(body) ? body : []);
          if (env.ANNASETU_KV) {
            await env.ANNASETU_KV.put('annasetu:foods', JSON.stringify(foods));
          }
          memoryStore.set('annasetu:foods', foods);
          return sendJson({ success: true, count: foods.length });
        } catch (err) {
          return sendJson({ success: false, error: err.message }, 500);
        }
      }
    }

    // 5. Shared Requisitions API (GET / POST)
    if (url.pathname === '/api/requisitions') {
      if (request.method === 'GET') {
        let reqs = [];
        if (env.ANNASETU_KV) {
          const raw = await env.ANNASETU_KV.get('annasetu:requisitions');
          if (raw) {
            try { reqs = JSON.parse(raw); } catch {}
          }
        }
        if (!reqs || reqs.length === 0) {
          reqs = memoryStore.get('annasetu:requisitions') || [];
        }
        return sendJson({ success: true, requisitions: reqs });
      }

      if (request.method === 'POST') {
        try {
          const body = await request.json();
          const reqs = Array.isArray(body.requisitions) ? body.requisitions : (Array.isArray(body) ? body : []);
          if (env.ANNASETU_KV) {
            await env.ANNASETU_KV.put('annasetu:requisitions', JSON.stringify(reqs));
          }
          memoryStore.set('annasetu:requisitions', reqs);
          return sendJson({ success: true, count: reqs.length });
        } catch (err) {
          return sendJson({ success: false, error: err.message }, 500);
        }
      }
    }

    // 6. Shared Users API (GET / POST)
    if (url.pathname === '/api/users') {
      if (request.method === 'GET') {
        let users = [];
        if (env.ANNASETU_KV) {
          const raw = await env.ANNASETU_KV.get('annasetu:users');
          if (raw) {
            try { users = JSON.parse(raw); } catch {}
          }
        }
        if (!users || users.length === 0) {
          users = memoryStore.get('annasetu:users') || [];
        }
        return sendJson({ success: true, users });
      }

      if (request.method === 'POST') {
        try {
          const body = await request.json();
          const users = Array.isArray(body.users) ? body.users : (Array.isArray(body) ? body : []);
          if (env.ANNASETU_KV) {
            await env.ANNASETU_KV.put('annasetu:users', JSON.stringify(users));
          }
          memoryStore.set('annasetu:users', users);
          return sendJson({ success: true, count: users.length });
        } catch (err) {
          return sendJson({ success: false, error: err.message }, 500);
        }
      }
    }

    // 7. PIN Code Matching Alert to NGOs
    if (url.pathname === '/api/notifications/pincode-alert' && request.method === 'POST') {
      try {
        const body = await request.json();
        const { pincode, foodItem, ngos } = body;

        if (!pincode || !foodItem || !Array.isArray(ngos)) {
          return sendJson({ success: false, error: 'pincode, foodItem and ngos list required.' }, 400);
        }

        const matchingNgos = ngos.filter((n) => String(n.pincode).trim() === String(pincode).trim());
        const notifiedList = [];

        for (const ngo of matchingNgos) {
          const ngoEmail = ngo.email || 'annasetu0@gmail.com';
          const html = renderEmailTemplate({
            headline: `🚨 Urgent Food Surplus Alert in PIN Code ${pincode}`,
            lead: `Hello <strong>${ngo.name}</strong>, a surplus food donation was just listed in your service area (${pincode}). NGOs do not need to monitor the dashboard 24/7—we alert you immediately!`,
            bodyHtml: `
              <div><strong>🍱 Food Item:</strong> ${foodItem.name} (${foodItem.category})</div>
              <div><strong>⚖️ Quantity:</strong> ${foodItem.quantity} ${foodItem.unit} (~${foodItem.estimatedWeightKg || (foodItem.quantity * 0.4).toFixed(1)} kg)</div>
              <div><strong>📍 Location:</strong> ${foodItem.address} (PIN: ${pincode})</div>
              <div><strong>🕒 Collection Deadline:</strong> ${foodItem.pickup}</div>
              <div><strong>🍲 Donor:</strong> ${foodItem.donor}</div>
              <div><strong>🌡️ Storage:</strong> ${foodItem.storageConditions}</div>
            `,
            actionBox: `<div style="font-weight:700;color:#22c55e;font-size:16px;">Log in to AnnaSetu AI to claim this pickup before deadline</div>`,
          });

          await sendWorkerSmtp({
            smtpEmail,
            smtpPass,
            fromName,
            to: ngoEmail,
            subject: `[AnnaSetu AI Alert] Surplus Food Available in PIN ${pincode}: ${foodItem.quantity} ${foodItem.unit} of ${foodItem.name}`,
            html,
          });
          notifiedList.push({ name: ngo.name, email: ngoEmail });
        }

        return sendJson({
          success: true,
          pincode,
          notifiedCount: notifiedList.length,
          notifiedList,
        });
      } catch (err) {
        return sendJson({ success: false, error: err.message }, 500);
      }
    }

    // 8. Dual Confirmation Emails (Step-by-step notifications)
    if (url.pathname === '/api/notifications/step-email' && request.method === 'POST') {
      try {
        const body = await request.json();
        const { step, donorEmail, donorName, ngoEmail, ngoName, foodTitle, pickupAddress, otp, volunteerName, volunteerPhone, eta, quantity, unit, weightKg } = body;

        // Step 1: Donation published
        if (step === 'donation_published' && donorEmail) {
          const html = renderEmailTemplate({
            headline: 'Surplus Donation Published Successfully',
            lead: `Hello <strong>${donorName}</strong>, your surplus food listing is now broadcasted to verified NGOs in your PIN code area:`,
            bodyHtml: `
              <div><strong>🍱 Food:</strong> ${foodTitle}</div>
              <div><strong>⚖️ Quantity:</strong> ${quantity} ${unit} (~${weightKg} kg)</div>
              <div><strong>📍 Address:</strong> ${pickupAddress}</div>
            `,
          });
          await sendWorkerSmtp({ smtpEmail, smtpPass, fromName, to: donorEmail, subject: `[AnnaSetu AI] Donation Published: ${foodTitle}`, html });
        }

        // Step 2: NGO submits rescue request
        if (step === 'request_submitted') {
          if (donorEmail) {
            const htmlDonor = renderEmailTemplate({
              headline: 'New Food Rescue Request Received!',
              lead: `Hello <strong>${donorName}</strong>, <strong>${ngoName}</strong> has submitted a pickup request for your surplus food:`,
              bodyHtml: `
                <div><strong>🍱 Food:</strong> ${foodTitle}</div>
                <div><strong>🤝 NGO:</strong> ${ngoName}</div>
                <div><strong>👤 Volunteer:</strong> ${volunteerName} (${volunteerPhone})</div>
                <div><strong>⏱️ Estimated Arrival:</strong> ${eta}</div>
              `,
              actionBox: `<div style="color:#4ade80;font-weight:700;">Please log into your Donor Dashboard to Accept or Decline</div>`,
            });
            await sendWorkerSmtp({ smtpEmail, smtpPass, fromName, to: donorEmail, subject: `[AnnaSetu AI] New Rescue Request from ${ngoName} for ${foodTitle}`, html: htmlDonor });
          }

          if (ngoEmail) {
            const htmlNgo = renderEmailTemplate({
              headline: 'Rescue Request Submitted',
              lead: `Hello <strong>${ngoName}</strong>, your pickup request for <strong>${foodTitle}</strong> was sent to <strong>${donorName}</strong>.`,
              bodyHtml: `
                <div><strong>📍 Donor Address:</strong> ${pickupAddress}</div>
                <div><strong>👤 Assigned Volunteer:</strong> ${volunteerName}</div>
                <div><strong>⏱️ ETA:</strong> ${eta}</div>
              `,
              actionBox: `<div style="color:#94a3b8;font-size:13px;">You will receive your Handover OTP email as soon as the donor approves.</div>`,
            });
            await sendWorkerSmtp({ smtpEmail, smtpPass, fromName, to: ngoEmail, subject: `[AnnaSetu AI] Pickup Request Submitted to ${donorName}`, html: htmlNgo });
          }
        }

        // Step 3: Donor accepts request (Dispatches OTP to NGO & Confirmation to Donor)
        if (step === 'request_accepted') {
          if (ngoEmail) {
            const htmlNgo = renderEmailTemplate({
              headline: 'Rescue Request Approved · Handover OTP Code',
              lead: `Hello <strong>${ngoName}</strong>, your request for <strong>${foodTitle}</strong> has been approved by <strong>${donorName}</strong>! Show the 4-digit code below to the donor upon arrival:`,
              actionBox: `<div class="digits">#${otp}</div><div style="font-size:12px;color:#86efac;margin-top:6px;">Single-use pickup verification code</div>`,
              bodyHtml: `
                <div><strong>🍲 Donor:</strong> ${donorName}</div>
                <div><strong>📍 Pickup Address:</strong> ${pickupAddress}</div>
              `,
            });
            await sendWorkerSmtp({ smtpEmail, smtpPass, fromName, to: ngoEmail, subject: `[AnnaSetu AI] Request Approved! Handover OTP: #${otp}`, html: htmlNgo });
          }

          if (donorEmail) {
            const htmlDonor = renderEmailTemplate({
              headline: 'Pickup Request Approved',
              lead: `Hello <strong>${donorName}</strong>, you approved <strong>${ngoName}</strong> for the pickup of <strong>${foodTitle}</strong>.`,
              bodyHtml: `
                <div><strong>🔐 Handover Verification:</strong> 4-digit OTP dispatched to NGO volunteer</div>
                <div><strong>👤 Volunteer:</strong> ${volunteerName} (${volunteerPhone})</div>
              `,
              actionBox: `<div style="color:#4ade80;font-size:13px;">When the volunteer arrives to collect the parcel, ask them for their 4-digit Handover OTP code to verify and complete handover.</div>`,
            });
            await sendWorkerSmtp({ smtpEmail, smtpPass, fromName, to: donorEmail, subject: `[AnnaSetu AI] Pickup Approved for ${ngoName}`, html: htmlDonor });
          }
        }

        // Step 4: Volunteer is en route
        if (step === 'volunteer_en_route') {
          if (donorEmail) {
            const htmlDonor = renderEmailTemplate({
              headline: 'NGO Volunteer is En Route!',
              lead: `Hello <strong>${donorName}</strong>, volunteer <strong>${volunteerName}</strong> from <strong>${ngoName}</strong> is now on the way to pick up <strong>${foodTitle}</strong>.`,
              bodyHtml: `
                <div><strong>📍 Your Address:</strong> ${pickupAddress}</div>
                <div><strong>📞 Volunteer Contact:</strong> ${volunteerPhone}</div>
                <div><strong>🔐 Handover Verification:</strong> Volunteer will provide 4-digit OTP upon collection</div>
              `,
            });
            await sendWorkerSmtp({ smtpEmail, smtpPass, fromName, to: donorEmail, subject: `[AnnaSetu AI] Volunteer is En Route for ${foodTitle}`, html: htmlDonor });
          }
        }

        // Step 5: Handover Completed
        if (step === 'handover_completed') {
          const summaryHtml = `
            <div><strong>🍱 Food:</strong> ${foodTitle}</div>
            <div><strong>🍱 Meals Rescued:</strong> ${quantity} ${unit}</div>
            <div><strong>⚖️ Waste Avoided:</strong> ~${weightKg} kg</div>
            <div><strong>✅ Verification:</strong> Authenticated via Handover OTP #${otp}</div>
          `;
          if (donorEmail) {
            const htmlDonor = renderEmailTemplate({
              headline: '🎉 Food Rescue & Handover Completed!',
              lead: `Thank you <strong>${donorName}</strong>! Your surplus food was safely collected by <strong>${ngoName}</strong>.`,
              bodyHtml: summaryHtml,
            });
            await sendWorkerSmtp({ smtpEmail, smtpPass, fromName, to: donorEmail, subject: `[AnnaSetu AI] Handover Completed: ${foodTitle} Rescued!`, html: htmlDonor });
          }
          if (ngoEmail) {
            const htmlNgo = renderEmailTemplate({
              headline: '🎉 Food Collection Verified & Handover Complete!',
              lead: `Thank you <strong>${ngoName}</strong>! The surplus food from <strong>${donorName}</strong> has been transferred into your care for distribution to those in need.`,
              bodyHtml: summaryHtml,
            });
            await sendWorkerSmtp({ smtpEmail, smtpPass, fromName, to: ngoEmail, subject: `[AnnaSetu AI] Rescue Completed: ${foodTitle} Safely Collected!`, html: htmlNgo });
          }
        }

        return sendJson({ success: true, message: `Notification for step ${step} dispatched.` });
      } catch (err) {
        return sendJson({ success: false, error: err.message }, 500);
      }
    }

    // 9. Food Safety Deterministic Inspect
    if (url.pathname === '/api/food-safety/inspect' && request.method === 'POST') {
      try {
        const body = await request.json();
        const { category, prepTime, storageCondition } = body;
        return sendJson({
          success: true,
          source: 'deterministic-fssai-standards',
          data: computeFssaiSafetyStandards(category, prepTime, storageCondition),
        });
      } catch (err) {
        return sendJson({ success: false, error: err.message }, 500);
      }
    }

    // 10. Fallback to Static Assets (SPA)
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response('Not found', { status: 404 });
  },
};
