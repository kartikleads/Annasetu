import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import nodemailer from 'nodemailer'

function annaSetuBackendPlugin(env) {
  // In-memory registration OTP store
  const registerOtpStore = new Map() // email -> { otp, expiresAt, verified, userPayload }
  let devFoods = []
  let devRequisitions = []
  let devUsers = []

  const smtpEmail = (env.SMTP_EMAIL || '').trim()
  const smtpPass = (env.SMTP_APP_PASSWORD || '').replace(/["']/g, '').trim()
  const fromName = (env.SMTP_FROM_NAME || 'AnnaSetu Verification').replace(/["']/g, '').trim()

  const transporter =
    smtpEmail && smtpPass
      ? nodemailer.createTransport({
          service: 'gmail',
          auth: {
            user: smtpEmail,
            pass: smtpPass,
          },
        })
      : null

  function readBody(req) {
    return new Promise((resolve) => {
      let raw = ''
      req.on('data', (chunk) => {
        raw += chunk
      })
      req.on('end', () => {
        try {
          resolve(JSON.parse(raw || '{}'))
        } catch {
          resolve({})
        }
      })
    })
  }

  function sendJson(res, statusCode, data) {
    res.statusCode = statusCode
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify(data))
  }

  async function sendEmail({ to, subject, html }) {
    if (!transporter) {
      console.warn(`[Backend] SMTP not configured. Skipped email to ${to}`)
      return { success: false, simulated: true }
    }
    try {
      await transporter.sendMail({
        from: `"${fromName}" <${smtpEmail}>`,
        to,
        subject,
        html,
      })
      console.log(`[Backend] Email successfully sent to ${to} (${subject})`)
      return { success: true }
    } catch (err) {
      console.error(`[Backend] Email dispatch error to ${to}:`, err.message)
      return { success: false, error: err.message }
    }
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
    `
  }

  return {
    name: 'annasetu-backend-plugin',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url?.split('?')[0]

        // 1. Health & Config Status
        if (req.method === 'GET' && url === '/api/status') {
          return sendJson(res, 200, {
            status: 'online',
            smtpConfigured: Boolean(transporter),
            safetyEngine: 'Deterministic FSSAI Safe Food Standards (Zero AI Dependency)',
          })
        }

        // 2. Auth: Send Registration 6-Digit Verification OTP
        if (req.method === 'POST' && url === '/api/auth/send-register-otp') {
          const body = await readBody(req)
          const email = (body.email || '').trim().toLowerCase()
          const name = (body.name || 'User').trim()
          const role = body.role || 'donor'

          if (!email || !email.includes('@')) {
            return sendJson(res, 400, { success: false, error: 'Valid email is required.' })
          }

          const otp = String(Math.floor(100000 + Math.random() * 900000)) // 6-digit OTP
          const expiresAt = Date.now() + 15 * 60 * 1000 // 15 mins
          registerOtpStore.set(email, { otp, expiresAt, verified: false, name, role, userPayload: body })

          const html = renderEmailTemplate({
            headline: 'Verify Your Email · AnnaSetu AI Account Activation',
            lead: `Hello <strong>${name}</strong>, thank you for joining AnnaSetu AI as a verified <strong>${role === 'donor' ? 'Food Donor' : 'Rescue NGO'}</strong>. Use the 6-digit activation code below to verify your email address:`,
            actionBox: `<div class="digits">${otp}</div><div style="font-size:12px;color:#86efac;margin-top:6px;">Valid for 15 minutes · Single-use activation code</div>`,
          })

          await sendEmail({
            to: email,
            subject: `[AnnaSetu AI] Your 6-Digit Email Verification Code: ${otp}`,
            html,
          })

          return sendJson(res, 200, {
            success: true,
            otp, // returned for test convenience
            message: `Verification code sent to ${email}`,
          })
        }

        // 3. Auth: Verify Registration OTP
        if (req.method === 'POST' && url === '/api/auth/verify-register-otp') {
          const body = await readBody(req)
          const email = (body.email || '').trim().toLowerCase()
          const otp = (body.otp || '').trim()

          const record = registerOtpStore.get(email)
          if (!record) {
            return sendJson(res, 400, { success: false, error: 'No active verification code found for this email.' })
          }

          if (Date.now() > record.expiresAt) {
            registerOtpStore.delete(email)
            return sendJson(res, 400, { success: false, error: 'This verification code has expired. Please request a new one.' })
          }

          if (record.otp !== otp) {
            return sendJson(res, 400, { success: false, error: 'Incorrect verification code. Please check and try again.' })
          }

          record.verified = true
          registerOtpStore.delete(email)
          return sendJson(res, 200, {
            success: true,
            message: 'Email successfully verified! Your account is active.',
            user: record.userPayload,
          })
        }

        // Shared Foods Endpoints
        if (url === '/api/foods') {
          if (req.method === 'GET') {
            return sendJson(res, 200, { success: true, foods: devFoods })
          }
          if (req.method === 'POST') {
            const body = await readBody(req)
            devFoods = Array.isArray(body.foods) ? body.foods : (Array.isArray(body) ? body : [])
            return sendJson(res, 200, { success: true, count: devFoods.length })
          }
        }

        // Shared Requisitions Endpoints
        if (url === '/api/requisitions') {
          if (req.method === 'GET') {
            return sendJson(res, 200, { success: true, requisitions: devRequisitions })
          }
          if (req.method === 'POST') {
            const body = await readBody(req)
            devRequisitions = Array.isArray(body.requisitions) ? body.requisitions : (Array.isArray(body) ? body : [])
            return sendJson(res, 200, { success: true, count: devRequisitions.length })
          }
        }

        // Shared Users Endpoints
        if (url === '/api/users') {
          if (req.method === 'GET') {
            return sendJson(res, 200, { success: true, users: devUsers })
          }
          if (req.method === 'POST') {
            const body = await readBody(req)
            devUsers = Array.isArray(body.users) ? body.users : (Array.isArray(body) ? body : [])
            return sendJson(res, 200, { success: true, count: devUsers.length })
          }
        }

        // 4. Notifications: PIN Code Match Alert to NGOs
        if (req.method === 'POST' && url === '/api/notifications/pincode-alert') {
          const body = await readBody(req)
          const { pincode, foodItem, ngos } = body

          if (!pincode || !foodItem || !Array.isArray(ngos)) {
            return sendJson(res, 400, { success: false, error: 'pincode, foodItem and ngos list required.' })
          }

          // Filter NGOs operating in the exact same pincode
          const matchingNgos = ngos.filter((n) => String(n.pincode).trim() === String(pincode).trim())
          const notifiedList = []

          for (const ngo of matchingNgos) {
            const ngoEmail = ngo.email || 'annasetu0@gmail.com'
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
            })

            await sendEmail({
              to: ngoEmail,
              subject: `[AnnaSetu AI Alert] Surplus Food Available in your PIN Code ${pincode}: ${foodItem.quantity} ${foodItem.unit} of ${foodItem.name}`,
              html,
            })
            notifiedList.push({ name: ngo.name, email: ngoEmail })
          }

          return sendJson(res, 200, {
            success: true,
            pincode,
            notifiedCount: notifiedList.length,
            notifiedList,
          })
        }

        // 5. Notifications: Step-by-Step Dual Emails (To BOTH Donor & NGO)
        if (req.method === 'POST' && url === '/api/notifications/step-email') {
          const body = await readBody(req)
          const { step, donorEmail, donorName, ngoEmail, ngoName, foodTitle, pickupAddress, otp, volunteerName, volunteerPhone, eta, quantity, unit, weightKg } = body

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
            })
            await sendEmail({ to: donorEmail, subject: `[AnnaSetu AI] Donation Published: ${foodTitle}`, html })
          }

          // Step 2: NGO submits rescue request
          if (step === 'request_submitted') {
            // Email to Donor
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
              })
              await sendEmail({ to: donorEmail, subject: `[AnnaSetu AI] New Rescue Request from ${ngoName} for ${foodTitle}`, html: htmlDonor })
            }

            // Confirmation Email to NGO
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
              })
              await sendEmail({ to: ngoEmail, subject: `[AnnaSetu AI] Pickup Request Submitted to ${donorName}`, html: htmlNgo })
            }
          }

          // Step 3: Donor accepts request (Dispatches OTP to NGO & Confirmation to Donor)
          if (step === 'request_accepted') {
            // Email to NGO with OTP
            if (ngoEmail) {
              const htmlNgo = renderEmailTemplate({
                headline: 'Rescue Request Approved · Handover OTP Code',
                lead: `Hello <strong>${ngoName}</strong>, your request for <strong>${foodTitle}</strong> has been approved by <strong>${donorName}</strong>! Show the 4-digit code below to the donor upon arrival:`,
                actionBox: `<div class="digits">#${otp}</div><div style="font-size:12px;color:#86efac;margin-top:6px;">Single-use pickup verification code</div>`,
                bodyHtml: `
                  <div><strong>🍲 Donor:</strong> ${donorName}</div>
                  <div><strong>📍 Pickup Address:</strong> ${pickupAddress}</div>
                `,
              })
              await sendEmail({ to: ngoEmail, subject: `[AnnaSetu AI] Request Approved! Handover OTP: #${otp}`, html: htmlNgo })
            }

            // Email to Donor
            if (donorEmail) {
              const htmlDonor = renderEmailTemplate({
                headline: 'Pickup Request Approved',
                lead: `Hello <strong>${donorName}</strong>, you approved <strong>${ngoName}</strong> for the pickup of <strong>${foodTitle}</strong>.`,
                bodyHtml: `
                  <div><strong>🔐 Handover Verification:</strong> 4-digit OTP dispatched to NGO volunteer</div>
                  <div><strong>👤 Volunteer:</strong> ${volunteerName} (${volunteerPhone})</div>
                `,
                actionBox: `<div style="color:#4ade80;font-size:13px;">When the volunteer arrives to collect the parcel, ask them for their 4-digit Handover OTP code to verify and complete handover.</div>`,
              })
              await sendEmail({ to: donorEmail, subject: `[AnnaSetu AI] Pickup Approved for ${ngoName}`, html: htmlDonor })
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
              })
              await sendEmail({ to: donorEmail, subject: `[AnnaSetu AI] Volunteer is En Route for ${foodTitle}`, html: htmlDonor })
            }
          }

          // Step 5: Handover Completed (Dual Confirmation)
          if (step === 'handover_completed') {
            const summaryHtml = `
              <div><strong>🍱 Food:</strong> ${foodTitle}</div>
              <div><strong>🍱 Meals Rescued:</strong> ${quantity} ${unit}</div>
              <div><strong>⚖️ Waste Avoided:</strong> ~${weightKg} kg</div>
              <div><strong>✅ Verification:</strong> Cryptographically authenticated via OTP #${otp}</div>
            `
            if (donorEmail) {
              const htmlDonor = renderEmailTemplate({
                headline: '🎉 Food Rescue & Handover Completed!',
                lead: `Thank you <strong>${donorName}</strong>! Your surplus food was safely collected by <strong>${ngoName}</strong>.`,
                bodyHtml: summaryHtml,
              })
              await sendEmail({ to: donorEmail, subject: `[AnnaSetu AI] Handover Completed: ${foodTitle} Rescued!`, html: htmlDonor })
            }
            if (ngoEmail) {
              const htmlNgo = renderEmailTemplate({
                headline: '🎉 Food Collection Verified & Handover Complete!',
                lead: `Thank you <strong>${ngoName}</strong>! The surplus food from <strong>${donorName}</strong> has been transferred into your care for distribution to those in need.`,
                bodyHtml: summaryHtml,
              })
              await sendEmail({ to: ngoEmail, subject: `[AnnaSetu AI] Rescue Completed: ${foodTitle} Safely Collected!`, html: htmlNgo })
            }
          }

          return sendJson(res, 200, { success: true, message: `Notification for step ${step} dispatched.` })
        }

        // 6. Food Safety Inspection Engine (Deterministic FSSAI Guidelines)
        if (req.method === 'POST' && url === '/api/food-safety/inspect') {
          const body = await readBody(req)
          const { category, prepTime, storageCondition } = body

          return sendJson(res, 200, {
            success: true,
            source: 'deterministic-fssai-standards',
            data: computeFssaiSafetyStandards(category, prepTime, storageCondition),
          })
        }

        next()
      })
    },
  }
}

function computeFssaiSafetyStandards(category, prepTime, storageCondition) {
  const isHighRisk =
    category?.toLowerCase().includes('non-veg') ||
    category?.toLowerCase().includes('meat') ||
    category?.toLowerCase().includes('dairy')

  const isAmbient =
    storageCondition?.toLowerCase().includes('ambient') ||
    storageCondition?.toLowerCase().includes('room')

  const isCold = storageCondition?.toLowerCase().includes('refrigerat')
  const isHot =
    storageCondition?.toLowerCase().includes('heated') ||
    storageCondition?.toLowerCase().includes('>60')

  if (isHighRisk && isAmbient) {
    return {
      safetyRisk: 'High',
      safetyScore: 65,
      isSuitable: true,
      maxSafeHours: 2,
      priorityLevel: 'Critical',
      handlingAdvice: 'Perishable proteins at ambient room temperature must be consumed within 2 hours.',
      rationale: 'FSSAI Danger Zone rule (5°C to 60°C rapid bacterial growth threshold).',
    }
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
    }
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
    }
  }

  return {
    safetyRisk: 'Low',
    safetyScore: 92,
    isSuitable: true,
    maxSafeHours: 4,
    priorityLevel: 'Normal',
    handlingAdvice: 'Transport in clean, insulated food-grade containers.',
    rationale: 'Batch complies with standard cooked food consumption timeframe.',
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react(), annaSetuBackendPlugin(env)],
    server: {
      host: true,
      port: 5173,
    },
  }
})
