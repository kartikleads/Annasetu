/**
 * AnnaSetu — Subscription, Quality Control, and Verification UI Components
 * src/components/SubscriptionComponents.jsx
 */

import { useState, useMemo } from "react";
import {
  saveAdminUpiId,
  submitPaymentProof,
  SAMPLE_RECEIPT_IMAGE,
} from "../services/subscriptionService.js";

// ==========================================
// 1. UPI QR Code Component
// ==========================================
export function UpiQrCode({ upiId, amount = "1500", payeeName = "AnnaSetu Regulatory Network" }) {
  const [copied, setCopied] = useState(false);
  const [qrError, setQrError] = useState(false);

  const cleanUpi = (upiId || "").trim();
  const upiUri = `upi://pay?pa=${encodeURIComponent(cleanUpi)}&pn=${encodeURIComponent(
    payeeName
  )}&am=${encodeURIComponent(amount)}&cu=INR&tn=AnnaSetu%20Subscription`;

  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(
    upiUri
  )}&bgcolor=ffffff&color=0f172a&margin=8`;

  const handleCopy = () => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(cleanUpi);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    }
  };

  return (
    <div className="upi-qr-card">
      <div className="upi-qr-frame">
        {!qrError ? (
          <img
            src={qrUrl}
            alt={`Scan to Pay ₹${amount} to ${cleanUpi}`}
            className="upi-qr-image"
            onError={() => setQrError(true)}
          />
        ) : (
          <div className="upi-qr-fallback">
            <svg width="180" height="180" viewBox="0 0 180 180" fill="none">
              <rect width="180" height="180" rx="8" fill="#ffffff" />
              <rect x="20" y="20" width="40" height="40" fill="#0f172a" />
              <rect x="28" y="28" width="24" height="24" fill="#ffffff" />
              <rect x="34" y="34" width="12" height="12" fill="#0f172a" />
              <rect x="120" y="20" width="40" height="40" fill="#0f172a" />
              <rect x="128" y="28" width="24" height="24" fill="#ffffff" />
              <rect x="134" y="34" width="12" height="12" fill="#0f172a" />
              <rect x="20" y="120" width="40" height="40" fill="#0f172a" />
              <rect x="28" y="128" width="24" height="24" fill="#ffffff" />
              <rect x="34" y="134" width="12" height="12" fill="#0f172a" />
              <rect x="70" y="70" width="40" height="40" fill="#22c55e" rx="4" />
              <text x="90" y="95" textAnchor="middle" fill="#ffffff" fontSize="14" fontWeight="bold">₹{amount}</text>
            </svg>
          </div>
        )}
        <div className="qr-scan-guide">
          <span>Scan with any UPI App</span>
          <div className="upi-app-icons">
            <span className="upi-pill-tag">GPay</span>
            <span className="upi-pill-tag">PhonePe</span>
            <span className="upi-pill-tag">Paytm</span>
            <span className="upi-pill-tag">BHIM</span>
          </div>
        </div>
      </div>

      <div className="upi-id-box">
        <div className="upi-id-label">Official Receiving UPI ID</div>
        <div className="upi-id-row">
          <code className="upi-id-text">{cleanUpi}</code>
          <button
            type="button"
            className="secondary-button compact copy-btn"
            onClick={handleCopy}
            title="Copy UPI ID to clipboard"
          >
            {copied ? "✓ Copied!" : "📋 Copy"}
          </button>
        </div>
        <div className="upi-amount-row">
          <span>Amount Payable:</span>
          <strong>₹{amount}</strong>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// 2. Quality Gamification Card (Donor Only)
// ==========================================
export function QualityGamificationCard({
  rating = 4.6,
  onRatingChange,
  showControls = true,
  donorName = "McDonald's",
}) {
  const currentRating = Number(rating) || 4.6;

  // Exact badge thresholds as requested:
  // > 3.5: Green badge ("Trusted Donor Certificate - Excellent!")
  // 3.0 to 3.5: Blue badge ("Safe Zone - Improve more for certificates!")
  // 2.0 to 2.9: Orange alert ("Warning: Low quality food. Please improve.")
  // < 2.0: Red alert ("Action Taken: FSSAI and local authorities notified.")
  const badgeConfig = useMemo(() => {
    if (currentRating > 3.5) {
      return {
        type: "green",
        badgeText: "Trusted Donor Certificate - Excellent!",
        icon: "🏅",
        title: "Top-Tier Certified FBO",
        description:
          "Outstanding hygiene, pristine packaging, and sub-20 minute handover velocity. Eligible for annual ESG sustainability recognition.",
        actionNote: "✓ Official FSSAI surplus donor compliance certificate active.",
      };
    }
    if (currentRating >= 3.0) {
      return {
        type: "blue",
        badgeText: "Safe Zone - Improve more for certificates!",
        icon: "ℹ️",
        title: "Standard Operational Tier",
        description:
          "Surplus food is safe and edible. Maintain consistent thermal packing and timely dispatch to unlock Trusted Donor Certification.",
        actionNote: "💡 Rating > 3.5 required to claim official regulatory certificate.",
      };
    }
    if (currentRating >= 2.0) {
      return {
        type: "orange",
        badgeText: "Warning: Low quality food. Please improve.",
        icon: "⚠️",
        title: "Quality Warning Flagged",
        description:
          "Multiple NGO rescue partners noted packaging seal leaks or temperature deviations upon pickup. Mandatory audit checklist applied to next 3 donations.",
        actionNote: "⚠️ Quality review pending. Please follow standard thermal food storage guidelines.",
      };
    }
    return {
      type: "red",
      badgeText: "Action Taken: FSSAI and local authorities notified.",
      icon: "🚨",
      title: "Regulatory Compliance Escalation",
      description:
        "Critical safety thresholds breached. Handover complaints triggered automated FSSAI audit alert and central admin moderation holds.",
      actionNote: "🚨 FSSAI Central Enforcement and Municipal Health Inspectors notified.",
    };
  }, [currentRating]);

  return (
    <div className={`quality-control-card quality-theme-${badgeConfig.type}`}>
      <div className="quality-header">
        <div className="quality-header-left">
          <div className="quality-eyebrow">
            <span className="live-dot" />
            HYPERLOCAL QUALITY CONTROL &amp; FSSAI AUDIT
          </div>
          <h3>Food Safety &amp; Donor Gamification Tier</h3>
          <p className="quality-subtext">
            Continuous recipient NGO quality ratings for <strong>{donorName}</strong>.
          </p>
        </div>

        <div className="quality-rating-score-box">
          <div className="rating-score-number">
            {currentRating.toFixed(1)}
            <span className="rating-max">/ 5.0</span>
          </div>
          <div className="rating-stars-visual">
            {"★".repeat(Math.min(5, Math.max(1, Math.round(currentRating))))}
            {"☆".repeat(Math.max(0, 5 - Math.round(currentRating)))}
          </div>
          <small className="rating-count">Based on verified NGO pickups</small>
        </div>
      </div>

      {/* Main Dynamic Badge Requirement */}
      <div className={`quality-alert-badge quality-badge-${badgeConfig.type}`}>
        <span className="badge-icon">{badgeConfig.icon}</span>
        <div className="badge-content">
          <div className="badge-headline">{badgeConfig.badgeText}</div>
          <div className="badge-details">{badgeConfig.description}</div>
          <div className="badge-action-note">{badgeConfig.actionNote}</div>
        </div>
      </div>

      {/* Interactive Demo Controller to effortlessly show all 4 states to judges */}
      {showControls && (
        <div className="quality-demo-bar">
          <span className="demo-label">🎮 Interactive Judge Demo (Switch Rating):</span>
          <div className="demo-buttons-row">
            <button
              type="button"
              className={`demo-rate-pill rate-green ${currentRating > 3.5 ? "active" : ""}`}
              onClick={() => onRatingChange && onRatingChange(4.8)}
            >
              🏅 4.8 (Green Certificate)
            </button>
            <button
              type="button"
              className={`demo-rate-pill rate-blue ${currentRating >= 3.0 && currentRating <= 3.5 ? "active" : ""}`}
              onClick={() => onRatingChange && onRatingChange(3.3)}
            >
              ℹ️ 3.3 (Blue Safe Zone)
            </button>
            <button
              type="button"
              className={`demo-rate-pill rate-orange ${currentRating >= 2.0 && currentRating < 3.0 ? "active" : ""}`}
              onClick={() => onRatingChange && onRatingChange(2.4)}
            >
              ⚠️ 2.4 (Orange Warning)
            </button>
            <button
              type="button"
              className={`demo-rate-pill rate-red ${currentRating < 2.0 ? "active" : ""}`}
              onClick={() => onRatingChange && onRatingChange(1.6)}
            >
              🚨 1.6 (Red FSSAI Alert)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ==========================================
// 3. Premium Plans Section (User Dashboards)
// ==========================================
export function PremiumPlansSection({
  role = "donor",
  subscriptionStatus = "trial", // "trial" | "pending" | "active" | "rejected" | "due" | "banned"
  onOpenCheckout,
  onSimulateEmail,
  onToggleBan,
  isOverdueBanned = false,
  userEmail = "",
}) {
  const isDonor = role === "donor";

  return (
    <div className="premium-plans-section">
      <div className="premium-section-header">
        <div>
          <div className="eyebrow">
            <span className="live-dot" />
            ANNAPESETU ENTERPRISE &amp; RELIEF MEMBERSHIP
          </div>
          <h2>Verified Subscription Plans</h2>
          <p className="description">
            Powering sustainable surplus redistribution, guaranteed cold-chain compliance, and priority hyperlocal matching.
          </p>
        </div>

        {/* Current User Status Pill */}
        <div className="current-status-banner">
          <span className="status-label">
            Current Membership{userEmail ? ` (${userEmail})` : ""}:
          </span>
          {subscriptionStatus === "active" ? (
            <span className="status-pill status-pill-active">
              ✓ Subscription Activated!
            </span>
          ) : subscriptionStatus === "pending" ? (
            <span className="status-pill status-pill-pending">
              ⏳ Pending Verification...
            </span>
          ) : subscriptionStatus === "rejected" ? (
            <span className="status-pill status-pill-rejected">
              ✗ Payment Rejected - Please try again
            </span>
          ) : subscriptionStatus === "due" ? (
            <span className="status-pill status-pill-due">
              ⚠️ Payment Required
            </span>
          ) : isOverdueBanned ? (
            <span className="status-pill status-pill-banned">
              ⛔ Temporarily Banned - Payment Overdue
            </span>
          ) : (
            <span className="status-pill status-pill-trial">
              ⭐ 1-Month Free Trial (Active)
            </span>
          )}
        </div>
      </div>

      {/* Plan Cards Grid */}
      <div className="plans-grid">
        {/* Donor Plan Card - Rendered ONLY for Commercial Donor */}
        {isDonor && (
          <div className="plan-card featured">
            <div className="plan-badge-icon">🏢</div>
            <h3 className="plan-title">Commercial Donor Pro</h3>
            <div className="plan-price">
              <span className="currency">₹</span>
              <span className="amount">1500</span>
              <span className="period">/ month</span>
            </div>
            <div className="plan-trial-highlight">
              ✨ Includes 1-Month Free Trial. See exactly how much food waste you save!
            </div>

            <ul className="plan-features">
              <li>✓ Real-time automated surplus meal publishing</li>
              <li>✓ <strong>Detailed Food Waste &amp; CO2 Reduction Analytics</strong></li>
              <li>✓ Priority local NGO matching within 15-minute radius</li>
              <li>✓ FSSAI Verified Establishment Trust Certificate</li>
              <li>✓ Corporate CSR &amp; ESG Tax-Compliant Redistribution Reports</li>
            </ul>

            <div className="plan-action">
              {subscriptionStatus === "active" ? (
                <button type="button" className="secondary-button" disabled style={{ width: "100%" }}>
                  ✓ Plan Active
                </button>
              ) : subscriptionStatus === "pending" ? (
                <button
                  type="button"
                  className="secondary-button"
                  onClick={onOpenCheckout}
                  style={{ width: "100%", borderColor: "#fbbf24", color: "#fbbf24" }}
                >
                  ⏳ View Pending Verification
                </button>
              ) : (
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => onOpenCheckout && onOpenCheckout("donor-monthly")}
                  style={{ width: "100%" }}
                >
                  {subscriptionStatus === "rejected"
                    ? "Re-Submit Payment Proof →"
                    : "Upgrade / Pay ₹1500 via UPI →"}
                </button>
              )}
            </div>
          </div>
        )}

        {/* NGO Plan Card - Rendered ONLY for Relief NGO */}
        {!isDonor && (
          <div className="plan-card featured">
            <div className="plan-badge-icon">💚</div>
            <h3 className="plan-title">Relief NGO Rescue Partner</h3>
            <div className="plan-price">
              <span className="currency">₹</span>
              <span className="amount">1500</span>
              <span className="period">/ 3 months</span>
            </div>
            <div className="plan-trial-highlight">
              ✨ 1-Month Free Trial. Save time &amp; money finding verified, high-quality food instantly.
            </div>

            <ul className="plan-features">
              <li>✓ Instant reservation locks on commercial food surplus</li>
              <li>✓ Multi-vehicle fleet dispatch &amp; route optimization</li>
              <li>✓ Verified FSSAI quality audit &amp; thermal packing checks</li>
              <li>✓ Unlimited Community Shelter Requisition broadcasts</li>
              <li>✓ Emergency hunger relief direct donor hotline access</li>
            </ul>

            <div className="plan-action">
              {subscriptionStatus === "active" ? (
                <button type="button" className="secondary-button" disabled style={{ width: "100%" }}>
                  ✓ Plan Active
                </button>
              ) : subscriptionStatus === "pending" ? (
                <button
                  type="button"
                  className="secondary-button"
                  onClick={onOpenCheckout}
                  style={{ width: "100%", borderColor: "#fbbf24", color: "#fbbf24" }}
                >
                  ⏳ View Pending Verification
                </button>
              ) : (
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => onOpenCheckout && onOpenCheckout("ngo-quarterly")}
                  style={{ width: "100%" }}
                >
                  {subscriptionStatus === "rejected"
                    ? "Re-Submit Payment Proof →"
                    : "Upgrade / Pay ₹1500 via UPI →"}
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Presentation Sandbox Simulator Bar */}
      <div className="demo-simulation-panel">
        <div className="simulation-actions">
          <button
            type="button"
            className="secondary-button compact"
            onClick={() => onSimulateEmail && onSimulateEmail("reminder")}
            title="Simulate 24-hr payment reminder email trigger"
          >
            📧 Test: 1-Day Reminder Email
          </button>
          <button
            type="button"
            className="secondary-button compact"
            onClick={() => onSimulateEmail && onSimulateEmail("banned")}
            title="Simulate account suspended email trigger"
          >
            📧 Test: Account Banned Email
          </button>
          <button
            type="button"
            className={`secondary-button compact ${isOverdueBanned ? "danger-button active" : ""}`}
            onClick={() => onToggleBan && onToggleBan(!isOverdueBanned)}
          >
            {isOverdueBanned ? "🔓 Demo: Clear Ban / Restore" : "⛔ Demo: Simulate 5 Days Overdue (Ban)"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// 4. Payment Checkout & Screenshot Verification Modal
// ==========================================
export function PaymentCheckoutModal({
  isOpen,
  onClose,
  role = "donor",
  userEmail = "",
  userName = "",
  adminUpiId = "",
  onPaymentSubmitted,
  existingSubscription = null,
}) {
  const [selectedPlan, setSelectedPlan] = useState(
    role === "ngo" ? "ngo-quarterly" : "donor-monthly"
  );
  const [uploadedScreenshot, setUploadedScreenshot] = useState("");
  const [enteredUtr, setEnteredUtr] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const screenshotPreview = uploadedScreenshot || existingSubscription?.screenshotUrl || "";
  const utrNumber = enteredUtr !== "" ? enteredUtr : (existingSubscription?.utr || "");

  if (!isOpen) return null;

  const planName =
    selectedPlan === "ngo-quarterly"
      ? "NGO Plan: ₹1500 / 3 months"
      : "Donor Plan: ₹1500 / month";

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setErrorMsg("Please upload a valid image file (PNG, JPG, or screenshot).");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setUploadedScreenshot(reader.result);
      setErrorMsg("");
      if (!enteredUtr && !existingSubscription?.utr) {
        setEnteredUtr("UPI" + Math.floor(100000000000 + Math.random() * 900000000000));
      }
    };
    reader.readAsDataURL(file);
  };

  const handleUseSample = () => {
    setUploadedScreenshot(SAMPLE_RECEIPT_IMAGE);
    if (!enteredUtr && !existingSubscription?.utr) {
      setEnteredUtr("429104829104");
    }
    setErrorMsg("");
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!screenshotPreview) {
      setErrorMsg("Please upload or attach a payment receipt screenshot.");
      return;
    }
    if (!utrNumber.trim()) {
      setErrorMsg("Please enter the 12-digit UPI UTR / Reference number.");
      return;
    }

    setIsSubmitting(true);
    setTimeout(() => {
      const result = submitPaymentProof({
        userEmail,
        userName,
        role,
        planId: selectedPlan,
        planName,
        amount: "₹1,500",
        screenshotUrl: screenshotPreview,
        utr: utrNumber.trim(),
      });
      setIsSubmitting(false);
      if (onPaymentSubmitted) {
        onPaymentSubmitted(result);
      }
      onClose();
    }, 600);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        className="modal-content payment-checkout-modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: "680px" }}
      >
        <div className="modal-header">
          <div>
            <div className="eyebrow">
              <span className="live-dot" />
              UPI QR INSTANT CHECKOUT
            </div>
            <h2>AnnaSetu Subscription Verification</h2>
          </div>
          <button type="button" className="close-btn" onClick={onClose} aria-label="Close modal">
            ✕
          </button>
        </div>

        {/* Existing Status Banner if already submitted */}
        {existingSubscription && (
          <div
            className={`checkout-status-card status-${existingSubscription.status.toLowerCase()}`}
          >
            {existingSubscription.status === "Approved" ? (
              <div>
                <strong>✓ Subscription Activated!</strong>
                <p>Your payment was verified by Central Admin. Premium features unlocked.</p>
              </div>
            ) : existingSubscription.status === "Pending" ? (
              <div>
                <strong>⏳ Pending Verification...</strong>
                <p>Your payment screenshot is in the central admin queue. You can re-submit if needed.</p>
              </div>
            ) : (
              <div>
                <strong>✗ Payment Rejected - Please try again</strong>
                <p>{existingSubscription.adminNotes || "Receipt could not be matched. Please re-upload with clear UTR."}</p>
              </div>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="checkout-grid">
            {/* Left: Dynamic QR Code */}
            <div className="checkout-qr-side">
              <UpiQrCode
                upiId={adminUpiId}
                amount="1500"
                payeeName="AnnaSetu Central Regulatory"
              />
            </div>

            {/* Right: Upload & UTR Form */}
            <div className="checkout-upload-side">
              <div className="checkout-step-header">
                <span className="step-num">Step 2</span>
                <h4>Submit Verification Proof</h4>
              </div>

              <div className="form-group" style={{ marginBottom: "12px" }}>
                <label style={{ fontSize: "12px", color: "#94a3b8", display: "block", marginBottom: "4px" }}>
                  Selected Plan:
                </label>
                <select
                  value={selectedPlan}
                  onChange={(e) => setSelectedPlan(e.target.value)}
                  className="branch-property-select"
                >
                  <option value="donor-monthly">Donor Pro (₹1500 / month)</option>
                  <option value="ngo-quarterly">NGO Rescue Partner (₹1500 / 3 months)</option>
                </select>
              </div>

              {/* Upload Screenshot Box */}
              <div className="screenshot-upload-box">
                <label className="upload-label">
                  <span>📷 Upload Payment Screenshot</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileUpload}
                    className="file-input-hidden"
                  />
                  <div className="upload-dropzone">
                    {screenshotPreview ? (
                      <div className="screenshot-preview-container">
                        <img
                          src={screenshotPreview}
                          alt="Payment Receipt Preview"
                          className="screenshot-preview-thumb"
                        />
                        <span className="change-photo-badge">Change Screenshot</span>
                      </div>
                    ) : (
                      <div className="upload-prompt">
                        <span style={{ fontSize: "28px" }}>📤</span>
                        <div style={{ fontWeight: 600, color: "#f8fafc", marginTop: "6px" }}>
                          Click to select payment screenshot
                        </div>
                        <small style={{ color: "#94a3b8" }}>PNG, JPG or Google Pay / PhonePe receipt</small>
                      </div>
                    )}
                  </div>
                </label>

                {/* Instant Sample Button for Seamless Presentation */}
                <button
                  type="button"
                  className="switcher-pill"
                  onClick={handleUseSample}
                  style={{
                    width: "100%",
                    marginTop: "8px",
                    justifyContent: "center",
                    fontSize: "12px",
                    borderColor: "rgba(34, 197, 94, 0.4)",
                    color: "#86efac",
                  }}
                >
                  ⚡ Auto-Fill Sample Verified Screenshot (Demo)
                </button>
              </div>

              {/* UTR Input */}
              <div className="form-group" style={{ marginTop: "14px" }}>
                <label style={{ fontSize: "12px", color: "#94a3b8", display: "block", marginBottom: "4px" }}>
                  12-Digit UPI Ref / UTR Number:
                </label>
                <input
                  type="text"
                  placeholder="e.g. 429104829104"
                  value={utrNumber}
                  onChange={(e) => setEnteredUtr(e.target.value.replace(/\s+/g, ""))}
                  className="admin-login-input"
                  style={{ marginBottom: "0", textAlign: "left", fontSize: "14px", padding: "10px 12px" }}
                  required
                />
              </div>

              {errorMsg && (
                <div className="form-notice" style={{ marginTop: "10px", color: "#f87171" }}>
                  {errorMsg}
                </div>
              )}
            </div>
          </div>

          <div className="confirm-actions" style={{ marginTop: "24px" }}>
            <button type="button" className="secondary-button" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className="primary-button"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Submitting Proof..." : "Submit Payment Screenshot →"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

// ==========================================
// 5. Login "Payment Required" Modal (Popup upon load if due)
// ==========================================
export function PaymentRequiredModal({
  isOpen,
  onClose,
  onPayNow,
  role = "donor",
}) {
  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onClose} style={{ zIndex: 9999 }}>
      <section
        className="modal-content payment-due-popup-modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: "520px", textAlign: "center" }}
      >
        <span style={{ fontSize: "48px", display: "block", marginBottom: "8px" }}>⚠️</span>
        <div className="eyebrow" style={{ justifyContent: "center", marginBottom: "8px" }}>
          <span className="live-dot" />
          SUBSCRIPTION RENEWAL NOTICE
        </div>
        <h2>Payment Required</h2>
        <p style={{ color: "#cbd5e1", fontSize: "14px", lineHeight: "1.6", margin: "14px 0 20px" }}>
          Your 1-Month Free Trial has expired. To maintain uninterrupted access to real-time surplus redistribution,
          FSSAI compliance certificates, and instant shelter matching, please complete your subscription payment.
        </p>

        <div className="due-summary-card">
          <div className="due-row">
            <span>Outstanding Amount:</span>
            <strong style={{ color: "#4ade80", fontSize: "18px" }}>₹1,500</strong>
          </div>
          <div className="due-row">
            <span>Plan:</span>
            <span>{role === "ngo" ? "NGO Partner (3 Months)" : "Donor Pro (1 Month)"}</span>
          </div>
          <div className="due-row">
            <span>Grace Period:</span>
            <span style={{ color: "#fbbf24" }}>Expires in 24 Hours</span>
          </div>
        </div>

        <div className="confirm-actions" style={{ marginTop: "24px", justifyContent: "center" }}>
          <button type="button" className="secondary-button" onClick={onClose}>
            Remind Me Later
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={onPayNow}
          >
            Pay Now via UPI →
          </button>
        </div>
      </section>
    </div>
  );
}

// ==========================================
// 6. Account Banned Overdue Overlay (5 Days Overdue)
// ==========================================
export function AccountBannedOverlay({
  isOpen,
  onPayNow,
  onDismissBan,
  userEmail = "",
}) {
  if (!isOpen) return null;

  return (
    <div className="account-banned-fullscreen">
      <div className="banned-card-box">
        <div className="banned-icon-pulse">⛔</div>
        <div className="banned-eyebrow">CENTRAL REGULATORY SANCTION</div>
        <h2>Temporarily Banned - Payment Overdue</h2>
        <p className="banned-description">
          Access to the AnnaSetu Surplus Food Redistribution Network has been locked for{" "}
          <strong>{userEmail}</strong> because your subscription renewal is <strong>5 days overdue</strong>.
        </p>

        <div className="banned-details-grid">
          <div className="detail-item">
            <small>Outstanding Renewal</small>
            <strong>₹1,500</strong>
          </div>
          <div className="detail-item">
            <small>Overdue Duration</small>
            <strong style={{ color: "#f87171" }}>5 Days Overdue</strong>
          </div>
          <div className="detail-item">
            <small>Account Privileges</small>
            <strong style={{ color: "#f87171" }}>Locked / Suspended</strong>
          </div>
        </div>

        <p className="banned-notice-fine">
          Per FSSAI Central Compliance rules, surplus food publishing and rescue claims are halted until payment verification is approved.
        </p>

        <div className="banned-actions">
          <button
            type="button"
            className="primary-button primary-submit-btn"
            style={{
              background: "linear-gradient(135deg, #dc2626 0%, #991b1b 100%)",
              borderColor: "#dc2626",
            }}
            onClick={onPayNow}
          >
            💳 Pay via UPI &amp; Request Restoration
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={onDismissBan}
            style={{ borderColor: "rgba(255, 255, 255, 0.2)" }}
          >
            🛠️ Demo Sandbox: Unban Account
          </button>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// 7. Visual Toast Email Simulator
// ==========================================
export function EmailToastContainer({ toasts = [], onDismiss }) {
  if (!toasts || toasts.length === 0) return null;

  return (
    <div className="email-toast-stack">
      {toasts.map((toast) => (
        <div key={toast.id} className={`email-toast-item toast-${toast.type || "reminder"}`}>
          <div className="toast-icon">
            {toast.type === "banned" ? "🚨" : "📧"}
          </div>
          <div className="toast-body">
            <div className="toast-header-row">
              <strong>{toast.title}</strong>
              <small>{toast.time || "Just now"}</small>
            </div>
            <div className="toast-recipient">To: {toast.recipient}</div>
            <p className="toast-snippet">{toast.message}</p>
          </div>
          <button
            type="button"
            className="toast-dismiss"
            onClick={() => onDismiss && onDismiss(toast.id)}
            aria-label="Dismiss toast"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}

// ==========================================
// 8. Admin Panel Oversight (Admin Dashboard)
// ==========================================
export function AdminSubscriptionsPanel({
  adminUpiId = "",
  onUpdateAdminUpi,
  subscriptions = [],
  onApprove,
  onReject,
  showBanner,
}) {
  const [customUpi, setCustomUpi] = useState(null);
  const upiInput = customUpi !== null ? customUpi : (adminUpiId || "");
  const [filter, setFilter] = useState("All");
  const [activePreviewScreenshot, setActivePreviewScreenshot] = useState(null);

  const handleSaveUpi = (e) => {
    e.preventDefault();
    if (!upiInput.trim()) return;
    const saved = saveAdminUpiId(upiInput.trim());
    setCustomUpi(saved);
    if (onUpdateAdminUpi) {
      onUpdateAdminUpi(saved);
    }
    if (showBanner) {
      showBanner(`Receiving UPI ID updated to "${saved}"! All user QR codes updated immediately.`, "success");
    }
  };

  const filteredSubs = useMemo(() => {
    if (filter === "All") return subscriptions;
    return subscriptions.filter((s) => s.status.toLowerCase() === filter.toLowerCase());
  }, [subscriptions, filter]);

  const pendingCount = subscriptions.filter((s) => s.status === "Pending").length;

  return (
    <div className="admin-subscriptions-management">
      {/* 1. UPI Management Box */}
      <div className="admin-upi-box">
        <div className="upi-box-header">
          <div>
            <div className="eyebrow">
              <span className="live-dot" />
              GLOBAL ESCROW REVENUE MANAGEMENT
            </div>
            <h3>Admin Receiving UPI Configuration</h3>
            <p style={{ color: "#94a3b8", fontSize: "13px", margin: "4px 0 0" }}>
              Dynamic payment destination. Updating this address instantly regenerates QR codes for all users across India.
            </p>
          </div>

          <div className="upi-active-pill">
            <span>Active UPI:</span>
            <code>{adminUpiId}</code>
          </div>
        </div>

        <form onSubmit={handleSaveUpi} className="admin-upi-form">
          <div className="upi-form-row">
            <input
              type="text"
              value={upiInput}
              onChange={(e) => setCustomUpi(e.target.value)}
              placeholder="e.g. annasetu.admin@okhdfcbank"
              className="admin-login-input"
              style={{ marginBottom: "0", textAlign: "left", flex: 1 }}
              required
            />
            <button type="submit" className="primary-button" style={{ whiteSpace: "nowrap" }}>
              💾 Save &amp; Broadcast UPI ID
            </button>
          </div>
        </form>
      </div>

      {/* 2. Verification Queue Table */}
      <div className="admin-verification-queue">
        <div className="queue-header">
          <div>
            <div className="eyebrow">
              <span className="live-dot" />
              REGULATORY AUDIT PIPELINE
            </div>
            <h3>
              Subscription Payment Verification Queue{" "}
              {pendingCount > 0 && <span className="admin-badge-pending">{pendingCount} Pending</span>}
            </h3>
          </div>

          <div className="queue-filter-tabs">
            {["All", "Pending", "Approved", "Rejected"].map((tab) => (
              <button
                key={tab}
                type="button"
                className={`queue-filter-btn ${filter === tab ? "active" : ""}`}
                onClick={() => setFilter(tab)}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        {filteredSubs.length === 0 ? (
          <div className="empty-state" style={{ padding: "36px 20px" }}>
            <span style={{ fontSize: "36px" }}>✓</span>
            <p>No verification requests matching "{filter}".</p>
          </div>
        ) : (
          <div className="queue-table-container">
            <table className="admin-queue-table">
              <thead>
                <tr>
                  <th>Subscriber / Organization</th>
                  <th>Role</th>
                  <th>Plan &amp; Amount</th>
                  <th>UTR / Reference</th>
                  <th>Screenshot Proof</th>
                  <th>Submitted</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredSubs.map((sub) => (
                  <tr key={sub.id} className={`queue-row row-${sub.status.toLowerCase()}`}>
                    <td>
                      <strong>{sub.userName}</strong>
                      <small style={{ display: "block", color: "#94a3b8" }}>{sub.userEmail}</small>
                    </td>
                    <td>
                      <span className={`role-badge role-${sub.role}`}>
                        {sub.role === "donor" ? "Donor" : "NGO"}
                      </span>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{sub.amount}</div>
                      <small style={{ color: "#94a3b8" }}>{sub.planName}</small>
                    </td>
                    <td>
                      <code className="utr-code">{sub.utr || "N/A"}</code>
                    </td>
                    <td>
                      {sub.screenshotUrl ? (
                        <button
                          type="button"
                          className="view-screenshot-btn"
                          onClick={() => setActivePreviewScreenshot(sub)}
                          title="Click to view full screenshot"
                        >
                          <img
                            src={sub.screenshotUrl}
                            alt="Receipt thumb"
                            className="receipt-thumb"
                          />
                          <span>View Proof 🔍</span>
                        </button>
                      ) : (
                        <span style={{ color: "#64748b" }}>No file</span>
                      )}
                    </td>
                    <td>
                      <small style={{ color: "#cbd5e1" }}>{sub.submittedAt || "Recently"}</small>
                    </td>
                    <td>
                      <span className={`status-pill status-pill-${sub.status.toLowerCase()}`}>
                        {sub.status === "Approved"
                          ? "✓ Approved"
                          : sub.status === "Pending"
                          ? "⏳ Pending"
                          : "✗ Rejected"}
                      </span>
                    </td>
                    <td>
                      <div className="queue-actions">
                        {sub.status !== "Approved" && (
                          <button
                            type="button"
                            className="action-approve-btn"
                            onClick={() => onApprove && onApprove(sub.id)}
                            title="Approve payment & activate subscription"
                          >
                            ✓ Approve
                          </button>
                        )}
                        {sub.status !== "Rejected" && (
                          <button
                            type="button"
                            className="action-reject-btn"
                            onClick={() => onReject && onReject(sub.id)}
                            title="Reject payment & request re-upload"
                          >
                            ✗ Reject
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Screenshot Expand Modal */}
      {activePreviewScreenshot && (
        <div className="modal-backdrop" onClick={() => setActivePreviewScreenshot(null)}>
          <div
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: "480px", textAlign: "center" }}
          >
            <div className="modal-header">
              <h3>Payment Proof: {activePreviewScreenshot.userName}</h3>
              <button
                type="button"
                className="close-btn"
                onClick={() => setActivePreviewScreenshot(null)}
              >
                ✕
              </button>
            </div>
            <div style={{ margin: "16px 0" }}>
              <img
                src={activePreviewScreenshot.screenshotUrl}
                alt="Full Payment Proof"
                style={{ width: "100%", maxHeight: "460px", objectFit: "contain", borderRadius: "10px" }}
              />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", color: "#cbd5e1" }}>
              <span>UTR: <code>{activePreviewScreenshot.utr}</code></span>
              <span>Amount: <strong>{activePreviewScreenshot.amount}</strong></span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
