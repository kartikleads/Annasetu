import { useEffect, useState, useMemo } from "react";
import "./App.css";
import {
  loadFoods,
  fetchFoodsFromCloud,
  broadcastFoodMutation,
  loadRequisitions,
  fetchRequisitionsFromCloud,
  broadcastRequisitionMutation,
  subscribeToCrossTabEvents,
  resetToCleanData,
  normalizeRequisition,
  checkDonorOwnership,
} from "./src/services/backendService.js";
import { SEED_NGOS } from "./src/services/seedData.js";
import {
  calculateImpactMetrics,
  applySafetyExpiry,
  isPickupExpired,
  getRemainingMinutes,
  rankNgoMatches,
} from "./src/services/matchingEngine.js";
import {
  sendRegisterOtp,
  verifyRegisterOtp,
  sendPincodeAlert,
  sendStepEmail,
} from "./src/services/emailService.js";
import {
  saveUserAccount,
  verifyCredentials,
  getCurrentSession,
  setCurrentSession,
  clearCurrentSession,
  getRegisteredUsers,
  fetchUsersFromCloud,
  checkUserExists,
  verifyAdminPassword,
  setAdminSession,
  updateRegisteredUser,
  deleteRegisteredUser,
} from "./src/services/authService.js";
import {
  getAdminUpiId,
  saveAdminUpiId,
  getSubscriptions,
  approveSubscription,
  rejectSubscription,
  getDonorQualityRating,
  saveDonorQualityRating,
} from "./src/services/subscriptionService.js";
import {
  QualityGamificationCard,
  PremiumPlansSection,
  PaymentCheckoutModal,
  PaymentRequiredModal,
  AccountBannedOverlay,
  EmailToastContainer,
  AdminSubscriptionsPanel,
} from "./src/components/SubscriptionComponents.jsx";

const validFSSAI = (value) => /^[0-9]{14}$/.test((value || "").trim());

const checkFssaiMatch = (estName, fssaiRegName) => {
  const norm1 = (estName || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const norm2 = (fssaiRegName || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!norm1 || !norm2) return false;
  return norm1 === norm2 || norm1.includes(norm2) || norm2.includes(norm1);
};

const validNgoRegistration = (value) => {
  const val = (value || "").trim().toUpperCase();
  if (val.length < 5) return false;
  const darpanRegex = /^[A-Z]{2}\/\d{4}\/\d{5,8}$/;
  const trustRegex = /^[A-Z0-9\-/]{5,24}$/;
  return darpanRegex.test(val) || trustRegex.test(val);
};

function formatPickupTime(pickupValue) {
  if (!pickupValue) return "Not specified";
  if (pickupValue.startsWith("Today")) return pickupValue;
  const parsed = new Date(pickupValue);
  if (Number.isNaN(parsed.getTime())) return pickupValue;
  return parsed.toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

const checkIsAdminUrl = () => {
  if (typeof window === "undefined") return false;
  return (
    window.location.pathname.toLowerCase().startsWith("/admin") ||
    window.location.hash.toLowerCase() === "#admin"
  );
};

const CapsuleChevron = () => (
  <div className="btn-icon">
    <svg
      className="svg"
      viewBox="0 0 1024 1024"
      version="1.1"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M779.180132 473.232045 322.354755 16.406668c-21.413706-21.413706-56.121182-21.413706-77.534887 0-21.413706 21.413706-21.413706 56.122205 0 77.534887l418.057421 418.057421L244.819868 930.057421c-21.413706 21.413706-21.413706 56.122205 0 77.534887 10.706853 10.706853 24.759917 16.059767 38.767955 16.059767s28.061103-5.353938 38.767955-16.059767L779.180132 550.767955C800.593837 529.35425 800.593837 494.64575 779.180132 473.232045z" />
    </svg>
  </div>
);

const EYEBROW_PHRASES = [
  "LESS WASTE. MORE HOPE.",
  "GOOD FOOD. GREATER GOOD.",
  "ANNASETU HYPERLOCAL RESCUE",
];

const HEADLINE_TYPED_PHRASES = [
  "Greater good.",
  "LESS WASTE. MORE HOPE.",
  "Good food.",
  "AnnaSetu.",
];

function Typewriter({
  phrases = [],
  speed = 70,
  pause = 2000,
  deleteSpeed = 35,
  className = "",
  cursorClassName = "",
  loop = true,
}) {
  const [phraseIdx, setPhraseIdx] = useState(0);
  const [displayText, setDisplayText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (!phrases || phrases.length === 0) return;
    let timer;
    const current = phrases[phraseIdx % phrases.length];

    if (!isDeleting) {
      if (displayText.length < current.length) {
        timer = setTimeout(() => {
          setDisplayText(current.slice(0, displayText.length + 1));
        }, speed);
      } else if (loop && phrases.length > 1) {
        timer = setTimeout(() => {
          setIsDeleting(true);
        }, pause);
      }
    } else {
      if (displayText.length > 0) {
        timer = setTimeout(() => {
          setDisplayText(current.slice(0, displayText.length - 1));
        }, deleteSpeed);
      } else {
        timer = setTimeout(() => {
          setIsDeleting(false);
          setPhraseIdx((idx) => (idx + 1) % phrases.length);
        }, 150);
      }
    }

    return () => clearTimeout(timer);
  }, [displayText, isDeleting, phraseIdx, phrases, speed, pause, deleteSpeed, loop]);

  return (
    <span className={`typewriter-wrapper ${className}`}>
      <span className="typewriter-text">{displayText}</span>
      <span className={`typewriter-cursor ${cursorClassName}`} aria-hidden="true">
        |
      </span>
    </span>
  );
}

export default function App() {
  const [page, setPage] = useState("splash"); // splash | home | dashboard
  const [authMode, setAuthMode] = useState("login"); // login | register | verify_otp
  const [prevAuthOption, setPrevAuthOption] = useState("1");
  const [currentUser, setCurrentUser] = useState(getCurrentSession);

  // Auth Inputs (Lazily initialized from current session)
  const [role, setRole] = useState(() => getCurrentSession()?.role || "donor");
  const [name, setName] = useState(() => getCurrentSession()?.name || "");
  const [email, setEmail] = useState(() => getCurrentSession()?.email || "");
  const [password, setPassword] = useState("");
  const [pincode, setPincode] = useState(() => getCurrentSession()?.pincode || "240494");
  const [userAddress, setUserAddress] = useState(() => getCurrentSession()?.address || "");
  const [fssaiNumber, setFssaiNumber] = useState(() => getCurrentSession()?.fssaiNumber || "");
  const [fssaiName, setFssaiName] = useState(() => getCurrentSession()?.fssaiName || "");
  const [registrationNo, setRegistrationNo] = useState(() => getCurrentSession()?.registrationNo || "");
  const [collectionCapacity, setCollectionCapacity] = useState(() =>
    String(getCurrentSession()?.collectionCapacity || 100)
  );
  const [vehicleType, setVehicleType] = useState(() =>
    getCurrentSession()?.vehicleType || "Insulated Food Rescue Van"
  );

  // Registration OTP Verification
  const [pendingUserPayload, setPendingUserPayload] = useState(null);
  const [regOtp, setRegOtp] = useState("");
  const [isSendingOtp, setIsSendingOtp] = useState(false);

  // App & Feed State (Donating System)
  const [foods, setFoods] = useState(loadFoods);
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState("All");
  const [hideUnavailable, setHideUnavailable] = useState(false);
  const [notice, setNotice] = useState("");
  const [noticeType, setNoticeType] = useState("success");
  const [confirmRemove, setConfirmRemove] = useState(null);
  const [showDevSandbox, setShowDevSandbox] = useState(false);

  // Community Requisition State (Donation Asking System)
  const [requisitions, setRequisitions] = useState(loadRequisitions);
  const [dashboardTab, setDashboardTab] = useState("listings"); // listings | requisitions
  const [showRequisitionForm, setShowRequisitionForm] = useState(false);

  // NGO Requisition Inputs
  const [reqTitle, setReqTitle] = useState("");
  const [reqBeneficiary, setReqBeneficiary] = useState("Night Shelter for Homeless");
  const [reqMeals, setReqMeals] = useState("40");
  const [reqCategory, setReqCategory] = useState("Cooked Vegetarian Meals");
  const [reqUrgency, setReqUrgency] = useState("Tonight's Dinner (by 8 PM)");
  const [reqDeliveryPref, setReqDeliveryPref] = useState("NGO Volunteer Pickup (We bring rescue van)");
  const [reqPincode, setReqPincode] = useState(() => getCurrentSession()?.pincode || "240494");
  const [reqAddress, setReqAddress] = useState(() => getCurrentSession()?.address || "");
  const [reqContactPerson, setReqContactPerson] = useState("");
  const [reqContactPhone, setReqContactPhone] = useState("");
  const [reqNote, setReqNote] = useState("");

  // Donor Pledge Requisition Modal
  const [pledgingReqId, setPledgingReqId] = useState(null);
  const [pledgeMeals, setPledgeMeals] = useState("40");
  const [pledgeReadyTime, setPledgeReadyTime] = useState("Ready in 30 mins");
  const [pledgeNote, setPledgeNote] = useState("");

  // Admin Portal State (Strict Password Guarded)
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminPasswordInput, setAdminPasswordInput] = useState("");
  const [adminTab, setAdminTab] = useState("listings"); // listings | donors | ngos | audit | requisitions | subscriptions
  const [adminSearch, setAdminSearch] = useState("");
  const [adminPincodeFilter, setAdminPincodeFilter] = useState("All");
  const [registeredUsersList, setRegisteredUsersList] = useState(getRegisteredUsers);

  // Subscription, Verification & Quality Control States
  const [adminUpiId, setAdminUpiId] = useState(getAdminUpiId);
  const [subscriptionsList, setSubscriptionsList] = useState(getSubscriptions);
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [donorRating, setDonorRating] = useState(() => getDonorQualityRating(getCurrentSession()?.email || "mcdonalds@cprl.in"));
  const [isPaymentDue, setIsPaymentDue] = useState(false);
  const [paymentDueDismissed, setPaymentDueDismissed] = useState(false);
  const [isOverdueBanned, setIsOverdueBanned] = useState(false);
  const [emailToasts, setEmailToasts] = useState([]);

  // Donor Add Food Form (All Options)
  const [foodName, setFoodName] = useState("");
  const [category, setCategory] = useState("Vegetarian");
  const [quantity, setQuantity] = useState("10");
  const [unit, setUnit] = useState("meals");
  const [pickup, setPickup] = useState("");
  const [listingAddress, setListingAddress] = useState(() => getCurrentSession()?.address || "");
  const [listingPincode, setListingPincode] = useState(() => getCurrentSession()?.pincode || "240494");
  const [prepTime, setPrepTime] = useState("Cooked < 1 hour ago");
  const [storageConditions, setStorageConditions] = useState("Ambient (Room Temp)");
  const [packaging, setPackaging] = useState("Sealed Food Containers");
  const [dietary, setDietary] = useState(["Pure Veg"]);
  const [dockInstructions, setDockInstructions] = useState("");
  const [targetNgo, setTargetNgo] = useState("All");
  const [donationFrequency, setDonationFrequency] = useState("One-Time Surplus Event");
  const [handlingInstructions, setHandlingInstructions] = useState(
    "Transport in clean, insulated food containers."
  );

  // NGO Request Modal (All Options)
  const [activeRequestFoodId, setActiveRequestFoodId] = useState(null);
  const [portionType, setPortionType] = useState("full"); // full | partial
  const [portionQuantity, setPortionQuantity] = useState("10");
  const [volunteerName, setVolunteerName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [pickupEta, setPickupEta] = useState("Within 30 mins");
  const [requestVehicle, setRequestVehicle] = useState("Insulated Food Rescue Van");
  const [requestEquipment, setRequestEquipment] = useState("Thermal Insulation Boxes");
  const [requestBeneficiary, setRequestBeneficiary] = useState("Community Night Shelter");
  const [requestNote, setRequestNote] = useState("");

  const [rejectingFoodId, setRejectingFoodId] = useState(null);
  const [rejectReason, setRejectReason] = useState(
    "Pickup timing does not match our kitchen hours"
  );

  const [verifyingCollectionId, setVerifyingCollectionId] = useState(null);
  const [enteredOtp, setEnteredOtp] = useState("");

  // Account & Multi-Branch / Property Management State
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [accountTab, setAccountTab] = useState("profile"); // profile | branches
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editPincode, setEditPincode] = useState("");
  const [editFssaiNumber, setEditFssaiNumber] = useState("");
  const [editFssaiName, setEditFssaiName] = useState("");
  const [editRegistrationNo, setEditRegistrationNo] = useState("");
  const [editCollectionCapacity, setEditCollectionCapacity] = useState("100");
  const [editVehicleType, setEditVehicleType] = useState("Insulated Food Rescue Van");

  // Branch creation / edit inputs
  const [branchEditingId, setBranchEditingId] = useState(null); // null | "new" | string id
  const [branchName, setBranchName] = useState("");
  const [branchAddress, setBranchAddress] = useState("");
  const [branchPincode, setBranchPincode] = useState("");
  const [branchContactPerson, setBranchContactPerson] = useState("");
  const [branchPhone, setBranchPhone] = useState("");
  const [branchAccessNotes, setBranchAccessNotes] = useState("");

  const [selectedBranchId, setSelectedBranchId] = useState("");

  function showBanner(message, type = "success") {
    setNotice(message);
    setNoticeType(type);
  }

  // Cross-Tab Real-Time Sync & Auto-Expiry Sweep
  useEffect(() => {
    const unsubscribe = subscribeToCrossTabEvents(
      (updatedFoods) => setFoods(updatedFoods),
      (updatedReqs) => setRequisitions(updatedReqs)
    );

    // Initial Cloud Sync
    fetchFoodsFromCloud().then((cloudFoods) => {
      if (Array.isArray(cloudFoods) && cloudFoods.length > 0) {
        setFoods(cloudFoods);
      }
    });
    fetchRequisitionsFromCloud().then((cloudReqs) => {
      if (Array.isArray(cloudReqs) && cloudReqs.length > 0) {
        setRequisitions(cloudReqs);
      }
    });
    fetchUsersFromCloud().then((cloudUsers) => {
      if (Array.isArray(cloudUsers) && cloudUsers.length > 0) {
        setRegisteredUsersList(cloudUsers);
      }
    });

    // Cloud Polling interval (every 6 seconds for cross-browser synchronization)
    const cloudPollInterval = setInterval(() => {
      fetchFoodsFromCloud().then((cloudFoods) => {
        if (Array.isArray(cloudFoods)) setFoods(cloudFoods);
      });
      fetchRequisitionsFromCloud().then((cloudReqs) => {
        if (Array.isArray(cloudReqs)) setRequisitions(cloudReqs);
      });
    }, 6000);

    const expiryInterval = setInterval(() => {
      setFoods((current) => applySafetyExpiry(current));
    }, 30000);

    return () => {
      unsubscribe();
      clearInterval(cloudPollInterval);
      clearInterval(expiryInterval);
    };
  }, []);

  // Cross-tab real-time sync for Admin UPI, Subscriptions & Ratings
  useEffect(() => {
    const handleStorage = (e) => {
      if (!e.key || e.key === "annasetu-admin-upi-v1") {
        setAdminUpiId(getAdminUpiId());
      }
      if (!e.key || e.key === "annasetu-subscriptions-v1") {
        setSubscriptionsList(getSubscriptions());
      }
      if (!e.key || e.key === "annasetu-donor-ratings-v1") {
        setDonorRating(getDonorQualityRating(currentUser?.email || email));
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [currentUser, email]);

  // Subscription & Quality Control Computations
  const activeUserEmail = (currentUser?.email || email || "").trim().toLowerCase();
  const userSubscription = useMemo(() => {
    return (
      subscriptionsList.find(
        (s) => (s.userEmail || "").trim().toLowerCase() === activeUserEmail
      ) || null
    );
  }, [subscriptionsList, activeUserEmail]);

  const userSubStatus = useMemo(() => {
    if (isOverdueBanned) return "banned";
    if (userSubscription) {
      if (userSubscription.status === "Approved") return "active";
      if (userSubscription.status === "Pending") return "pending";
      if (userSubscription.status === "Rejected") return "rejected";
    }
    if (isPaymentDue) return "due";
    return "trial";
  }, [userSubscription, isPaymentDue, isOverdueBanned]);

  function handleDonorRatingChange(newRating) {
    const val = Number(newRating);
    setDonorRating(val);
    saveDonorQualityRating(currentUser?.email || email, val);
    showBanner(`Donor Quality Rating set to ${val.toFixed(1)} ⭐ (Gamification Tier adjusted).`, "info");
  }

  function handleApproveSubscription(subId) {
    const updated = approveSubscription(subId);
    setSubscriptionsList(updated);
    showBanner("Subscription approved! Subscriber upgraded to Active Pro tier.", "success");
  }

  function handleRejectSubscription(subId) {
    const updated = rejectSubscription(subId, "Proof could not be reconciled. Please re-upload with clear UTR.");
    setSubscriptionsList(updated);
    showBanner("Subscription marked as Rejected. User notified to re-upload receipt.", "warning");
  }

  function triggerEmailToast(type) {
    const targetEmail = currentUser?.email || email || "mcdonalds@cprl.in";
    const newToast = {
      id: "toast-" + Date.now(),
      type,
      title:
        type === "banned"
          ? "Email Sent: Account Temporarily Banned"
          : "Email Sent: Reminder 1 day before payment",
      recipient: targetEmail,
      message:
        type === "banned"
          ? "Suspension Notice: Your AnnaSetu account is 5 days overdue (₹1,500 renewal). Surplus food publishing and claiming have been suspended."
          : "Renewal Notice: Your AnnaSetu subscription plan renews in 24 hours (₹1,500). Please complete payment to avoid service interruption.",
      time: "Just now",
    };
    setEmailToasts((prev) => [newToast, ...prev]);
    setTimeout(() => {
      setEmailToasts((prev) => prev.filter((t) => t.id !== newToast.id));
    }, 6000);
  }

  function handleToggleBan(active) {
    setIsOverdueBanned(active);
    if (active) {
      triggerEmailToast("banned");
      showBanner("Simulating 5 days overdue: Full-screen account ban overlay active.", "error");
    } else {
      showBanner("Account restored! Overdue ban cleared.", "success");
    }
  }

  // Restore session or intro animation
  useEffect(() => {
    try {
      localStorage.removeItem("annasetu-foods");
      localStorage.removeItem("annasetu-foods-v2");
      localStorage.removeItem("annasetu-users");
      localStorage.removeItem("annasetu-users-v2");
      localStorage.removeItem("annasetu-admin-session");
      sessionStorage.removeItem("annasetu-admin-session");
    } catch {
      // ignore
    }

    const timer = setTimeout(() => {
      if (checkIsAdminUrl()) {
        setPage("admin");
      } else {
        setPage(getCurrentSession() ? "dashboard" : "home");
      }
    }, 1200);

    return () => clearTimeout(timer);
  }, []);

  // Listen for direct URL navigation (/admin) or browser back/forward
  useEffect(() => {
    const handleUrlChange = () => {
      if (checkIsAdminUrl()) {
        setPage("admin");
      } else if (page === "admin") {
        setPage(currentUser ? "dashboard" : "home");
      }
    };

    window.addEventListener("popstate", handleUrlChange);
    window.addEventListener("hashchange", handleUrlChange);
    return () => {
      window.removeEventListener("popstate", handleUrlChange);
      window.removeEventListener("hashchange", handleUrlChange);
    };
  }, [currentUser, page]);

  function updateFoodsAndBroadcast(updater) {
    setFoods((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      broadcastFoodMutation(next);
      return next;
    });
  }

  function updateRequisitionsAndBroadcast(updater) {
    setRequisitions((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      broadcastRequisitionMutation(next);
      return next;
    });
  }

  // Central Dashboard Impact Metrics for Admin Oversight (BONUS01)
  const adminMetrics = useMemo(() => {
    const totalListings = foods.length;
    const available = foods.filter(
      (f) => f.status === "Available" && !isPickupExpired(f.pickup)
    ).length;
    const pendingPickups = foods.filter(
      (f) =>
        f.status === "Requested" ||
        f.status === "Accepted" ||
        f.status === "Approved - Pending Handover"
    ).length;
    const collected = foods.filter((f) => f.status === "Collected").length;
    const unavailableOrExpired = foods.filter(
      (f) => f.status === "Unavailable" || isPickupExpired(f.pickup)
    ).length;

    let totalMeals = 0;
    let totalKg = 0;
    foods.forEach((f) => {
      const meals = Number(f.quantity) || 0;
      const kg =
        Number(f.estimatedWeightKg) ||
        (f.unit === "kg" ? meals : Math.round(meals * 0.4));
      if (f.status === "Collected") {
        totalMeals += meals;
        totalKg += kg;
      }
    });

    const openRequisitions = requisitions.filter((r) => r.status === "Open").length;
    const fulfilledRequisitions = requisitions.filter((r) => r.status === "Fulfilled").length;

    const donors = registeredUsersList.filter((u) => u.role === "donor");
    const ngos = registeredUsersList.filter((u) => u.role === "ngo");

    return {
      totalListings,
      available,
      pendingPickups,
      collected,
      unavailableOrExpired,
      totalMeals,
      totalKg,
      openRequisitions,
      fulfilledRequisitions,
      totalDonors: donors.length,
      verifiedDonors: donors.filter((d) => d.fssaiVerified).length,
      totalNgos: ngos.length,
      verifiedNgos: ngos.filter((n) => n.verified).length,
    };
  }, [foods, requisitions, registeredUsersList]);

  // 1. Submit Registration Form -> Real FSSAI Rule Verification (NO AI) -> Send 6-Digit OTP Email
  async function handleRegisterSubmit(e) {
    e.preventDefault();

    if (!name.trim() || !email.trim() || password.length < 6) {
      showBanner("Please fill all details. Password needs at least 6 characters.", "error");
      return;
    }

    if (checkUserExists(email.trim().toLowerCase())) {
      showBanner("An account with this email is already registered. Please sign in.", "warning");
      return;
    }

    if (pincode.trim().length !== 6 || !/^\d{6}$/.test(pincode.trim())) {
      showBanner("Please enter a valid 6-digit Indian postal PIN code.", "error");
      return;
    }

    // Direct FSSAI License & Establishment Name Match Check (WITHOUT AI)
    if (role === "donor") {
      if (!fssaiNumber.trim() || !validFSSAI(fssaiNumber)) {
        showBanner("Enter a valid 14-digit FSSAI License Number.", "error");
        return;
      }
      if (!checkFssaiMatch(name, fssaiName)) {
        showBanner(
          `FSSAI Verification Failed: Registered operator name ("${fssaiName.trim()}") does not match establishment name ("${name.trim()}"). Both must match identically.`,
          "error"
        );
        return;
      }
    }

    if (role === "ngo") {
      if (!registrationNo.trim()) {
        showBanner("Please enter your registered NGO number.", "error");
        return;
      }
      if (!validNgoRegistration(registrationNo)) {
        showBanner(
          `NGO Verification Failed: "${registrationNo.trim()}" does not match recognized NGO Darpan ID or Society Registration format (e.g. DL/2019/0246221).`,
          "error"
        );
        return;
      }
    }

    const payload = {
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password,
      role,
      pincode: pincode.trim(),
      address: userAddress.trim() || `PIN Code ${pincode.trim()}`,
      fssaiNumber: role === "donor" ? fssaiNumber.trim() : "",
      fssaiName: role === "donor" ? fssaiName.trim() : "",
      fssaiVerified: role === "donor" ? true : false,
      registrationNo: role === "ngo" ? registrationNo.trim() : "",
      collectionCapacity: role === "ngo" ? Number(collectionCapacity) || 100 : 0,
      storageFacilities:
        role === "ngo"
          ? ["Refrigeration Cold Room (4°C)", "Insulated Thermal Boxes"]
          : [],
      vehicleType: role === "ngo" ? vehicleType : "",
    };

    setIsSendingOtp(true);
    showBanner(`Dispatching verification code to ${email}...`);

    try {
      const res = await sendRegisterOtp(payload);
      if (res.success) {
        setPendingUserPayload(payload);
        setAuthMode("verify_otp");
        showBanner(`Verification code sent to ${email}! Check your inbox.`, "success");
      } else {
        showBanner(res.error || "Failed to dispatch email verification code.", "error");
      }
    } catch {
      showBanner("Error dispatching activation code. Please try again.", "error");
    } finally {
      setIsSendingOtp(false);
    }
  }

  // 2. Verify Registration OTP -> Activate Account & Log In
  async function handleVerifyOtpSubmit(e) {
    e.preventDefault();
    if (!pendingUserPayload || !regOtp.trim()) return;

    try {
      const res = await verifyRegisterOtp({
        email: pendingUserPayload.email,
        otp: regOtp.trim(),
      });

      if (res.success) {
        const activeUser = saveUserAccount(pendingUserPayload);
        setCurrentSession(activeUser);
        setCurrentUser(activeUser);
        setName(activeUser.name || "");
        setEmail(activeUser.email || "");
        setRole(activeUser.role || "donor");
        setPincode(activeUser.pincode || "240494");
        setListingPincode(activeUser.pincode || "240494");
        setListingAddress(activeUser.address || "");
        if (activeUser.fssaiNumber) setFssaiNumber(activeUser.fssaiNumber);
        if (activeUser.fssaiName) setFssaiName(activeUser.fssaiName);
        setPage("dashboard");
        setAuthMode("login");
        showBanner(
          `Account verified! Welcome to AnnaSetu, ${activeUser.name} (${
            activeUser.fssaiVerified ? "✓ FSSAI Certified FBO" : "Verified NGO"
          }).`,
          "success"
        );
      } else {
        showBanner(res.error || "Invalid verification code. Please check your email.", "error");
      }
    } catch {
      showBanner("Verification failed. Please check code and try again.", "error");
    }
  }

  // 3. Real User Login
  function handleLoginSubmit(e) {
    e.preventDefault();

    // Direct Admin Password Check Shortcut
    if (verifyAdminPassword(password)) {
      setAdminSession(true);
      setIsAdmin(true);
      setRegisteredUsersList(getRegisteredUsers());
      setPage("admin");
      showBanner("Admin Portal unlocked. Welcome, Administrator!", "success");
      return;
    }

    const result = verifyCredentials(email, password);

    if (result.success) {
      const user = result.user;
      setCurrentSession(user);
      setCurrentUser(user);
      setName(user.name || "");
      setEmail(user.email || "");
      setRole(user.role || "donor");
      setPincode(user.pincode || "240494");
      setListingPincode(user.pincode || "240494");
      setListingAddress(user.address || "");
      if (user.fssaiNumber) setFssaiNumber(user.fssaiNumber);
      if (user.fssaiName) setFssaiName(user.fssaiName);
      setNotice("");
      setPage("dashboard");
      setFilter("All");
      setShowForm(false);
    } else {
      showBanner(result.error, "error");
    }
  }

  // Admin Portal Actions & Moderation
  function handleAdminLogin(e) {
    if (e) e.preventDefault();
    if (verifyAdminPassword(adminPasswordInput)) {
      setAdminSession(true);
      setIsAdmin(true);
      setAdminPasswordInput("");
      setRegisteredUsersList(getRegisteredUsers());
      setPage("admin");
      if (typeof window !== "undefined" && !window.location.pathname.startsWith("/admin")) {
        window.history.pushState({}, "", "/admin");
      }
      showBanner("Admin Portal unlocked. Welcome, Administrator!", "success");
    } else {
      showBanner("Invalid Admin password. Access Denied.", "error");
    }
  }

  function handleAdminLogout() {
    setAdminSession(false);
    setIsAdmin(false);
    if (typeof window !== "undefined") {
      window.history.pushState({}, "", "/");
    }
    setPage(currentUser ? "dashboard" : "home");
    showBanner("Admin session closed.", "info");
  }

  function handleAdminFlagListing(foodId, reason) {
    const updated = foods.map((f) =>
      f.id === foodId
        ? {
            ...f,
            status: "Unavailable",
            unavailableReason:
              reason || "Flagged by Regulatory Admin: Quality review required.",
          }
        : f
    );
    updateFoodsAndBroadcast(updated);
    showBanner(`Listing #${foodId} flagged as Unavailable.`, "warning");
  }

  function handleAdminReinstateListing(foodId) {
    const updated = foods.map((f) =>
      f.id === foodId
        ? {
            ...f,
            status: "Available",
            unavailableReason: "",
          }
        : f
    );
    updateFoodsAndBroadcast(updated);
    showBanner(`Listing #${foodId} reinstated as Available.`, "success");
  }

  function handleAdminDeleteListing(foodId) {
    const updated = foods.filter((f) => f.id !== foodId);
    updateFoodsAndBroadcast(updated);
    showBanner(`Listing #${foodId} permanently removed by Admin.`, "error");
  }

  function handleAdminDeleteUser(userId) {
    const user = registeredUsersList.find((u) => u.id === userId);
    const updated = deleteRegisteredUser(userId);
    setRegisteredUsersList(updated);
    showBanner(`User "${user?.name || userId}" permanently deleted from registry.`, "error");
  }

  function handleAdminDeleteAuditTrail(foodId) {
    const updated = foods.filter((f) => f.id !== foodId);
    updateFoodsAndBroadcast(updated);
    showBanner(`Handover OTP audit record #${foodId} removed.`, "error");
  }

  function handleAdminDeleteRequisition(reqId) {
    const updated = requisitions.filter((r) => r.id !== reqId);
    updateRequisitionsAndBroadcast(updated);
    showBanner(`Shelter requisition #${reqId} permanently deleted.`, "error");
  }

  function handleAdminToggleFssai(userId) {
    const user = registeredUsersList.find((u) => u.id === userId);
    if (!user) return;
    const nextStatus = !user.fssaiVerified;
    const updatedList = updateRegisteredUser(userId, { fssaiVerified: nextStatus });
    setRegisteredUsersList(updatedList);
    showBanner(
      `${user.name} FSSAI status updated to: ${nextStatus ? "✓ Verified FBO" : "⚠️ Revoked"}`,
      nextStatus ? "success" : "warning"
    );
  }

  function handleAdminToggleNgoVerified(userId) {
    const user = registeredUsersList.find((u) => u.id === userId);
    if (!user) return;
    const nextStatus = !user.verified;
    const updatedList = updateRegisteredUser(userId, { verified: nextStatus });
    setRegisteredUsersList(updatedList);
    showBanner(
      `${user.name} verification status updated to: ${nextStatus ? "✓ Active Verified" : "⚠️ Suspended"}`,
      nextStatus ? "success" : "warning"
    );
  }

  function handleCleanData() {
    const clean = resetToCleanData();
    updateFoodsAndBroadcast(clean);
    updateRequisitionsAndBroadcast([]);
    showBanner("Stale data cleared! Workspace refreshed with clean slate.", "success");
  }

  function handleLogout() {
    clearCurrentSession();
    setCurrentUser(null);
    setPage("home");
    setAuthMode("login");
    setName("");
    setEmail("");
    setPassword("");
    setNotice("");
    setShowForm(false);
    setShowRequisitionForm(false);
    setConfirmRemove(null);
    setCollectionCapacity("100");
    setVehicleType("Insulated Food Rescue Van");
    setShowAccountModal(false);
  }

  // Account & Multi-Branch Management Helpers
  function getUserBranches(user = currentUser) {
    if (!user) return [];
    if (Array.isArray(user.branches) && user.branches.length > 0) {
      return user.branches;
    }
    return [
      {
        id: `br-${user.id || "main"}`,
        name: `${user.name || "Main Facility"} (Headquarters / Primary)`,
        address: user.address || "Sector 18 Commercial Area",
        pincode: user.pincode || "240494",
        contactPerson: user.contactPerson || user.name || "Operations Lead",
        phone: user.phone || "9876543210",
        accessNotes: "Primary loading / pickup dock",
        isPrimary: true,
      },
    ];
  }

  function openAccountModal(tab = "profile") {
    if (!currentUser) return;
    setAccountTab(tab);
    setEditName(currentUser.name || "");
    setEditPhone(currentUser.phone || "9876543210");
    setEditAddress(currentUser.address || "");
    setEditPincode(currentUser.pincode || "240494");
    setEditFssaiNumber(currentUser.fssaiNumber || "");
    setEditFssaiName(currentUser.fssaiName || "");
    setEditRegistrationNo(currentUser.registrationNo || "");
    setEditCollectionCapacity(String(currentUser.collectionCapacity || 100));
    setEditVehicleType(currentUser.vehicleType || "Insulated Food Rescue Van");
    setBranchEditingId(null);
    setShowAccountModal(true);
  }

  function handleSaveProfile(e) {
    e.preventDefault();
    if (!currentUser) return;

    if (!editName.trim()) {
      showBanner("Organization name is required.", "error");
      return;
    }
    if (!editPincode.trim() || editPincode.trim().length !== 6 || !/^\d{6}$/.test(editPincode.trim())) {
      showBanner("Please enter a valid 6-digit postal PIN code.", "error");
      return;
    }
    if (currentUser.role === "donor" && editFssaiNumber.trim() && !validFSSAI(editFssaiNumber)) {
      showBanner("Please enter a valid 14-digit FSSAI License Number.", "error");
      return;
    }

    const patch = {
      name: editName.trim(),
      phone: editPhone.trim(),
      address: editAddress.trim(),
      pincode: editPincode.trim(),
      ...(currentUser.role === "donor"
        ? {
            fssaiNumber: editFssaiNumber.trim(),
            fssaiName: editFssaiName.trim() || editName.trim(),
            fssaiVerified: editFssaiNumber.trim().length === 14,
          }
        : {
            registrationNo: editRegistrationNo.trim(),
            collectionCapacity: Number(editCollectionCapacity) || 100,
            vehicleType: editVehicleType,
          }),
    };

    const updatedUser = { ...currentUser, ...patch };
    setCurrentUser(updatedUser);
    setCurrentSession(updatedUser);
    updateRegisteredUser(currentUser.id, patch);

    // Update active top-level states
    setName(updatedUser.name);
    setPincode(updatedUser.pincode);
    setUserAddress(updatedUser.address);
    setListingPincode(updatedUser.pincode);
    setListingAddress(updatedUser.address);

    showBanner("Profile details successfully updated!", "success");
    setShowAccountModal(false);
  }

  function handleStartAddBranch() {
    setBranchEditingId("new");
    setBranchName("");
    setBranchAddress("");
    setBranchPincode(pincode || "240494");
    setBranchContactPerson(name || "");
    setBranchPhone("9876543210");
    setBranchAccessNotes("");
  }

  function handleStartEditBranch(branch) {
    setBranchEditingId(branch.id);
    setBranchName(branch.name);
    setBranchAddress(branch.address);
    setBranchPincode(branch.pincode);
    setBranchContactPerson(branch.contactPerson || "");
    setBranchPhone(branch.phone || "");
    setBranchAccessNotes(branch.accessNotes || "");
  }

  function handleSaveBranch(e) {
    e.preventDefault();
    if (!currentUser) return;

    if (!branchName.trim() || !branchAddress.trim()) {
      showBanner("Branch name and street address are required.", "error");
      return;
    }
    if (!branchPincode.trim() || branchPincode.trim().length !== 6 || !/^\d{6}$/.test(branchPincode.trim())) {
      showBanner("Valid 6-digit postal PIN code is required for branch.", "error");
      return;
    }

    const currentBranches = getUserBranches(currentUser);
    let updatedBranches;

    if (branchEditingId === "new") {
      const newBranch = {
        id: `br-${Date.now()}`,
        name: branchName.trim(),
        address: branchAddress.trim(),
        pincode: branchPincode.trim(),
        contactPerson: branchContactPerson.trim() || currentUser.name,
        phone: branchPhone.trim() || "9876543210",
        accessNotes: branchAccessNotes.trim(),
        isPrimary: currentBranches.length === 0,
      };
      updatedBranches = [...currentBranches, newBranch];
      showBanner(`New branch "${branchName.trim()}" added to your account!`, "success");
    } else {
      updatedBranches = currentBranches.map((b) =>
        b.id === branchEditingId
          ? {
              ...b,
              name: branchName.trim(),
              address: branchAddress.trim(),
              pincode: branchPincode.trim(),
              contactPerson: branchContactPerson.trim() || currentUser.name,
              phone: branchPhone.trim(),
              accessNotes: branchAccessNotes.trim(),
            }
          : b
      );
      showBanner(`Branch "${branchName.trim()}" updated successfully!`, "success");
    }

    const updatedUser = { ...currentUser, branches: updatedBranches };
    setCurrentUser(updatedUser);
    setCurrentSession(updatedUser);
    updateRegisteredUser(currentUser.id, { branches: updatedBranches });

    setBranchEditingId(null);
  }

  function handleDeleteBranch(branchId) {
    if (!currentUser) return;
    const currentBranches = getUserBranches(currentUser);
    if (currentBranches.length <= 1) {
      showBanner("You must keep at least one active branch/facility on your account.", "warning");
      return;
    }
    const updatedBranches = currentBranches.filter((b) => b.id !== branchId);
    const updatedUser = { ...currentUser, branches: updatedBranches };
    setCurrentUser(updatedUser);
    setCurrentSession(updatedUser);
    updateRegisteredUser(currentUser.id, { branches: updatedBranches });
    showBanner("Branch removed from your account.", "warning");
  }

  function handleSetPrimaryBranch(branchId) {
    if (!currentUser) return;
    const currentBranches = getUserBranches(currentUser);
    const targetBranch = currentBranches.find((b) => b.id === branchId);
    if (!targetBranch) return;

    const updatedBranches = currentBranches.map((b) => ({
      ...b,
      isPrimary: b.id === branchId,
    }));

    const updatedUser = {
      ...currentUser,
      branches: updatedBranches,
      address: targetBranch.address,
      pincode: targetBranch.pincode,
    };

    setCurrentUser(updatedUser);
    setCurrentSession(updatedUser);
    updateRegisteredUser(currentUser.id, {
      branches: updatedBranches,
      address: targetBranch.address,
      pincode: targetBranch.pincode,
    });

    setUserAddress(targetBranch.address);
    setPincode(targetBranch.pincode);
    setListingAddress(targetBranch.address);
    setListingPincode(targetBranch.pincode);

    showBanner(`"${targetBranch.name}" set as your primary operating property.`, "success");
  }

  // Demo Persona Auto-Fill
  function autoFillDemo(personaRole) {
    setRole(personaRole);
    setPaymentDueDismissed(false);
    if (personaRole === "donor") {
      setName("McDonald's");
      setEmail("mcdonalds@cprl.in");
      setPassword("password123");
      setPincode("240494");
      setUserAddress("Mall Road, Ground Floor, Sector 18 (PIN: 240494)");
      setFssaiNumber("10014011001648");
      setFssaiName("McDonald's (Connaught Plaza Restaurants Pvt Ltd)");
      setListingPincode("240494");
      setListingAddress("Mall Road, Ground Floor, Sector 18 (PIN: 240494)");
      setDonorRating(getDonorQualityRating("mcdonalds@cprl.in"));
    } else {
      setName("Feeding India Charity Trust");
      setEmail("rescue@feedingindia.org");
      setPassword("password123");
      setPincode("240494");
      setUserAddress("Regional Relief Operations, Sector 18 (PIN: 240494)");
      setRegistrationNo("DL/2019/0246221");
      setCollectionCapacity("250");
      setVehicleType("Insulated Food Rescue Van");
      setReqContactPerson("Aarav Sharma");
      setReqContactPhone("9876543210");
      setReqPincode("240494");
      setReqAddress("Regional Relief Operations, Sector 18 (PIN: 240494)");
    }
    setNotice("");
  }

  function resetDemoData() {
    const reset = resetToCleanData();
    updateFoodsAndBroadcast(reset);
    updateRequisitionsAndBroadcast([]);
    setFilter("All");
    showBanner("Clean state restored.");
  }

  // Dietary Restrictions & Conflict Resolution Engine
  function getDietaryRestriction(tag) {
    const catLower = (category || "").toLowerCase();
    const isVegCategory =
      (catLower.includes("veg") && !catLower.includes("non-veg")) ||
      catLower.includes("fruit");
    const isNonVegCategory =
      catLower.includes("non-veg") || catLower.includes("meat");

    // Block tags that contradict the core food category
    if (tag === "Halal Certified" && isVegCategory) {
      return `Restricted: "Halal Certified" applies only to non-vegetarian foods, not ${category}.`;
    }

    if ((tag === "Pure Veg" || tag === "Jain") && isNonVegCategory) {
      return `Restricted: "${tag}" cannot be selected for Non-vegetarian category.`;
    }

    return null;
  }

  function handleDietaryToggle(tag) {
    const active = dietary.includes(tag);
    if (active) {
      if (tag === "Pure Veg") {
        // Deselecting Pure Veg also deselects Jain because Jain is strictly Pure Veg
        setDietary(dietary.filter((t) => t !== "Pure Veg" && t !== "Jain"));
      } else {
        setDietary(dietary.filter((t) => t !== tag));
      }
      return;
    }

    // Guard: Prevent selecting category-restricted options
    const restriction = getDietaryRestriction(tag);
    if (restriction) {
      showBanner(restriction, "error");
      return;
    }

    // Mutually exclusive handling: picking one option automatically deselects conflicting tags across all categories
    if (tag === "Halal Certified") {
      // Halal Certified automatically deselects Pure Veg and Jain
      const clean = dietary.filter((t) => t !== "Pure Veg" && t !== "Jain");
      setDietary([...clean, "Halal Certified"]);
      return;
    }

    if (tag === "Pure Veg") {
      // Pure Veg automatically deselects Halal Certified
      const clean = dietary.filter((t) => t !== "Halal Certified");
      setDietary([...clean, "Pure Veg"]);
      return;
    }

    if (tag === "Jain") {
      // Jain automatically deselects Halal Certified and includes Pure Veg
      const clean = dietary.filter((t) => t !== "Halal Certified");
      const next = clean.includes("Pure Veg")
        ? [...clean, "Jain"]
        : [...clean, "Pure Veg", "Jain"];
      setDietary(next);
      return;
    }

    // Other dietary tags (e.g. Gluten-Free, Eggless, Nut-Free)
    setDietary([...dietary, tag]);
  }

  // Donor Publishes Food (Donating System - All Options)
  async function addFood(e) {
    e.preventDefault();

    if (
      !foodName.trim() ||
      !listingAddress.trim() ||
      !pickup ||
      Number(quantity) < 1
    ) {
      showBanner("Please complete all food listing details.", "error");
      return;
    }

    if (listingPincode.trim().length !== 6 || !/^\d{6}$/.test(listingPincode.trim())) {
      showBanner("Please enter a valid 6-digit PIN code for pickup location.", "error");
      return;
    }

    if (isPickupExpired(pickup)) {
      showBanner("Pickup deadline cannot be in the past.", "error");
      return;
    }

    if (dietary.includes("Pure Veg") && dietary.includes("Halal Certified")) {
      showBanner("Dietary conflict: A listing cannot be both Pure Veg and Halal Certified.", "error");
      return;
    }

    if (dietary.includes("Jain") && dietary.includes("Halal Certified")) {
      showBanner("Dietary conflict: Jain food cannot be Halal Certified.", "error");
      return;
    }

    if ((category === "Vegetarian" || category === "Fruits") && dietary.includes("Halal Certified")) {
      showBanner(`Dietary conflict: Halal Certified cannot be selected for ${category} category.`, "error");
      return;
    }

    if (category === "Non-vegetarian" && (dietary.includes("Pure Veg") || dietary.includes("Jain"))) {
      showBanner("Dietary conflict: Non-vegetarian category cannot be Pure Veg or Jain.", "error");
      return;
    }

    const qty = Number(quantity);
    const weightKg = unit === "kg" ? qty : Number((qty * 0.4).toFixed(1));

    const activeDonorEmail = String(currentUser?.email || email || "").trim().toLowerCase();
    const activeDonorId = String(currentUser?.id || (activeDonorEmail ? `usr-${activeDonorEmail}` : "")).trim();
    const activeDonorName = String(currentUser?.name || name || "Commercial Kitchen").trim();

    const newFood = {
      id: Date.now(),
      donorId: activeDonorId || `usr-${Date.now()}`,
      name: foodName.trim(),
      category,
      quantity: qty,
      remainingQuantity: qty,
      portionClaimed: 0,
      unit,
      estimatedWeightKg: weightKg,
      packaging,
      dietary,
      dockInstructions: dockInstructions.trim(),
      targetNgo,
      donationFrequency,
      prepTime,
      storageConditions,
      handlingInstructions:
        handlingInstructions.trim() || "Transport in sanitary food containers",
      pickup,
      address: listingAddress.trim(),
      pincode: listingPincode.trim(),
      donor: activeDonorName,
      donorEmail: activeDonorEmail,
      donorCoords: { lat: 28.4721, lng: 77.5054 },
      status: "Available",
      claimedBy: "",
      pickupStage: "None",
      pickupCode: "",
      requestDetails: null,
      collectionConfirmedByNgo: false,
      collectedAt: "",
      unavailableReason: "",
      rejectedHistory: [],
      donorRating: null,
      ngoRating: null,
      rating: null,
    };

    updateFoodsAndBroadcast((current) => [newFood, ...current]);

    // 1. Send confirmation email to Donor
    sendStepEmail({
      step: "donation_published",
      donorEmail: activeDonorEmail,
      donorName: activeDonorName,
      foodTitle: `${qty} ${unit} of ${foodName.trim()} (${packaging})`,
      quantity: qty,
      unit,
      weightKg,
      pickupAddress: `${listingAddress.trim()} (PIN: ${listingPincode.trim()})`,
    });

    // 2. Dispatch Automated Email Alert to NGOs in the SAME PIN CODE
    const allNgos = [
      ...SEED_NGOS,
      ...getRegisteredUsers().filter((u) => u.role === "ngo"),
    ];

    sendPincodeAlert({
      pincode: listingPincode.trim(),
      foodItem: newFood,
      ngos: allNgos,
    }).then((res) => {
      if (res.notifiedCount > 0) {
        showBanner(
          `Published! Alert email sent to ${res.notifiedCount} NGO(s) in PIN code ${listingPincode}.`
        );
      }
    });

    setFoodName("");
    setQuantity("10");
    setPickup("");
    setDockInstructions("");
    setShowForm(false);
    showBanner("Surplus food donation published and broadcasted to local NGOs!");
  }

  // NGO Posts Food Requisition (Donation Asking System)
  function createRequisition(e) {
    e.preventDefault();
    if (!reqTitle.trim() || Number(reqMeals) < 1 || !reqAddress.trim() || !reqContactPhone.trim()) {
      showBanner("Please fill all requisition details.", "error");
      return;
    }

    if (reqPincode.trim().length !== 6 || !/^\d{6}$/.test(reqPincode.trim())) {
      showBanner("Enter a valid 6-digit PIN code for shelter location.", "error");
      return;
    }

    const newReq = normalizeRequisition({
      id: `req-${Date.now()}`,
      ngoName: name.trim() || "Verified Rescue NGO",
      ngoEmail: email.trim() || "rescue@feedingindia.org",
      pincode: reqPincode.trim(),
      address: reqAddress.trim(),
      title: reqTitle.trim(),
      beneficiaryType: reqBeneficiary,
      mealsNeeded: Number(reqMeals) || 40,
      categoryPreferred: reqCategory,
      urgency: reqUrgency,
      deliveryPreference: reqDeliveryPref,
      contactPerson: reqContactPerson.trim() || name.trim(),
      contactPhone: reqContactPhone.trim(),
      note: reqNote.trim(),
      status: "Open",
    });

    updateRequisitionsAndBroadcast((current) => [newReq, ...current]);
    setShowRequisitionForm(false);
    setReqTitle("");
    setReqMeals("40");
    setReqNote("");
    showBanner(
      "Food requisition broadcasted! Commercial food donors in your PIN code have been notified.",
      "success"
    );
  }

  // Donor Pledges Food to Fulfill an NGO Requisition
  function openPledgeModal(reqId) {
    const targetReq = requisitions.find((r) => r.id === reqId);
    if (!targetReq) return;
    setPledgingReqId(reqId);
    setPledgeMeals(String(targetReq.mealsNeeded));
    setPledgeReadyTime("Ready in 30 mins");
    setPledgeNote("");
  }

  function submitDonorPledge(e) {
    e.preventDefault();
    if (!pledgingReqId) return;

    const targetReq = requisitions.find((r) => r.id === pledgingReqId);
    if (!targetReq) return;

    const timestamp = new Date().toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
    });

    updateRequisitionsAndBroadcast((current) =>
      current.map((r) =>
        r.id === pledgingReqId
          ? {
              ...r,
              status: "Pledged",
              pledgedBy: name.trim() || "Donor Kitchen",
              pledgedDonorEmail: email.trim(),
              pledgedMeals: Number(pledgeMeals) || targetReq.mealsNeeded,
              pledgedReadyTime: pledgeReadyTime,
              pledgeNote: pledgeNote.trim(),
              pledgedAt: timestamp,
            }
          : r
      )
    );

    sendStepEmail({
      step: "donation_published",
      donorEmail: email.trim(),
      donorName: name.trim(),
      foodTitle: `${pledgeMeals} meals pledged for: ${targetReq.title}`,
      quantity: Number(pledgeMeals),
      unit: "meals",
      weightKg: Number((Number(pledgeMeals) * 0.4).toFixed(1)),
      pickupAddress: targetReq.address,
    });

    setPledgingReqId(null);
    showBanner(
      `Successfully pledged ${pledgeMeals} meals to ${targetReq.ngoName}! Dual confirmation dispatched.`
    );
  }

  // NGO Confirms Food Received / Fulfilled
  function confirmRequisitionFulfilled(reqId) {
    updateRequisitionsAndBroadcast((current) =>
      current.map((r) =>
        r.id === reqId
          ? {
              ...r,
              status: "Fulfilled",
              fulfilledAt: new Date().toLocaleTimeString("en-IN", {
                hour: "2-digit",
                minute: "2-digit",
              }),
            }
          : r
      )
    );
    showBanner(
      "Food delivery confirmed & requisition fulfilled! Beneficiaries nourished.",
      "success"
    );
  }

  // Open Request Modal (All NGO Options)
  function openRequestModal(id) {
    const food = foods.find((item) => item.id === id);
    const currentNgo = name.trim();

    if (!food) {
      showBanner("Listing not found.", "error");
      return;
    }

    if (isPickupExpired(food.pickup) || food.status === "Unavailable") {
      showBanner("This listing is currently unavailable or past deadline.", "error");
      return;
    }

    if (
      food.claimedBy &&
      food.claimedBy.toLowerCase() === currentNgo.toLowerCase() &&
      (food.status === "Requested" || food.status === "Accepted")
    ) {
      showBanner("Your NGO already has an active request on this listing.", "warning");
      return;
    }

    if (food.status !== "Available") {
      showBanner(`This listing is already ${food.status.toLowerCase()} by another NGO.`, "warning");
      return;
    }

    setActiveRequestFoodId(id);
    setPortionType("full");
    setPortionQuantity(String(food.quantity));
    setVolunteerName(volunteerName || (currentUser?.contactPerson || "Aarav Sharma"));
    setContactPhone(contactPhone || (currentUser?.contactPhone || "9876543210"));
    setPickupEta("Within 30 mins");
    setRequestVehicle(currentUser?.vehicleType || "Insulated Food Rescue Van");
    setRequestEquipment("Thermal Insulation Boxes (>60°C)");
    setRequestBeneficiary("Community Night Shelter");
    setRequestNote("");
  }

  // Submit NGO Food Request (Full or Partial Batch)
  async function submitNgoRequest(e) {
    e.preventDefault();
    if (!activeRequestFoodId) return;

    const currentNgo = name.trim();
    const food = foods.find((item) => item.id === activeRequestFoodId);
    if (!food) return;

    if (!volunteerName.trim() || contactPhone.trim().length < 10) {
      showBanner("Please provide volunteer name and valid 10-digit phone.", "error");
      return;
    }

    const requestedQty =
      portionType === "partial" &&
      Number(portionQuantity) > 0 &&
      Number(portionQuantity) < food.quantity
        ? Number(portionQuantity)
        : food.quantity;

    const requestDetails = {
      ngoName: currentNgo,
      ngoEmail: email.trim(),
      volunteerName: volunteerName.trim(),
      contactPhone: contactPhone.trim(),
      eta: pickupEta,
      vehicle: requestVehicle,
      equipment: requestEquipment,
      beneficiary: requestBeneficiary,
      portionClaimed: requestedQty,
      isPartial: requestedQty < food.quantity,
      note: requestNote.trim() || "Insulated rescue vehicle ready.",
      requestedAt: new Date().toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
      }),
    };

    if (requestedQty < food.quantity) {
      // Partial portion rescue
      const remainingQty = food.quantity - requestedQty;
      const partialClaimedItem = {
        ...food,
        id: Date.now(),
        quantity: requestedQty,
        remainingQuantity: 0,
        portionClaimed: requestedQty,
        estimatedWeightKg: Number(
          (requestedQty * (food.estimatedWeightKg / food.quantity)).toFixed(1)
        ),
        status: "Requested",
        claimedBy: currentNgo,
        pickupStage: "PendingApproval",
        requestDetails,
      };

      updateFoodsAndBroadcast((current) =>
        current.flatMap((item) =>
          item.id === activeRequestFoodId
            ? [
                partialClaimedItem,
                {
                  ...item,
                  quantity: remainingQty,
                  remainingQuantity: remainingQty,
                  estimatedWeightKg: Number(
                    (remainingQty * (food.estimatedWeightKg / food.quantity)).toFixed(1)
                  ),
                },
              ]
            : [item]
        )
      );
    } else {
      // Full batch rescue
      updateFoodsAndBroadcast((current) =>
        current.map((item) =>
          item.id === activeRequestFoodId
            ? {
                ...item,
                status: "Requested",
                claimedBy: currentNgo,
                pickupStage: "PendingApproval",
                requestDetails,
              }
            : item
        )
      );
    }

    // Send Real Emails to BOTH Donor and NGO
    sendStepEmail({
      step: "request_submitted",
      donorEmail: food.donorEmail || "annasetu0@gmail.com",
      donorName: food.donor,
      ngoEmail: email.trim(),
      ngoName: currentNgo,
      foodTitle: `${requestedQty} ${food.unit} of ${food.name}`,
      pickupAddress: `${food.address} (PIN: ${food.pincode})`,
      volunteerName: volunteerName.trim(),
      volunteerPhone: contactPhone.trim(),
      eta: pickupEta,
    });

    setActiveRequestFoodId(null);
    showBanner(
      `Pickup request for ${requestedQty} ${food.unit} sent to ${food.donor}! Confirmation emails dispatched.`
    );
  }

  function withdrawRequest(id) {
    const food = foods.find((item) => item.id === id);
    if (!food || food.status !== "Requested") return;

    updateFoodsAndBroadcast((current) =>
      current.map((item) =>
        item.id === id
          ? {
              ...item,
              status: "Available",
              claimedBy: "",
              pickupStage: "None",
              pickupCode: "",
              requestDetails: null,
            }
          : item
      )
    );
    showBanner("Request withdrawn. Listing is Available again.", "warning");
  }

  // Donor Accepts NGO Request -> Dispatches Real Gmail OTP to NGO & Confirmation to Donor
  async function acceptRequest(id) {
    const food = foods.find((item) => item.id === id);
    const activeUser = currentUser || { email, name, role };

    if (!food || !checkDonorOwnership(food, activeUser) || food.status !== "Requested") {
      showBanner("Permission denied: You can only manage requests for your own listings.", "error");
      return;
    }

    const generatedOtp = String(Math.floor(1000 + Math.random() * 9000));

    updateFoodsAndBroadcast((current) =>
      current.map((item) =>
        item.id === id
          ? {
              ...item,
              status: "Accepted",
              pickupStage: "Approved",
              pickupCode: generatedOtp,
            }
          : item
      )
    );

    const targetNgoEmail = food.requestDetails?.ngoEmail || "annasetu0@gmail.com";

    showBanner("Request approved! Handover OTP dispatched privately to the NGO volunteer via Gmail...");

    // Send Step Email to BOTH Parties
    sendStepEmail({
      step: "request_accepted",
      donorEmail: (food.donorEmail || email).trim(),
      donorName: (food.donor || name).trim(),
      ngoEmail: targetNgoEmail,
      ngoName: food.claimedBy,
      foodTitle: `${food.quantity} ${food.unit} of ${food.name}`,
      pickupAddress: `${food.address} (PIN: ${food.pincode})`,
      otp: generatedOtp,
      volunteerName: food.requestDetails?.volunteerName,
      volunteerPhone: food.requestDetails?.contactPhone,
    }).then((res) => {
      if (res.success) {
        showBanner(`Approved! Handover OTP dispatched privately to ${targetNgoEmail}. Ask volunteer for their code upon collection.`);
      }
    });
  }

  function confirmRejectRequest(e) {
    e.preventDefault();
    if (!rejectingFoodId) return;

    const food = foods.find((item) => item.id === rejectingFoodId);
    const activeUser = currentUser || { email, name, role };

    if (!food || !checkDonorOwnership(food, activeUser)) {
      showBanner("Permission denied: You can only decline requests for your own listings.", "error");
      setRejectingFoodId(null);
      return;
    }

    const rejectedEntry = {
      ngoName: food.claimedBy,
      reason: rejectReason.trim() || "Request declined by donor",
      time: new Date().toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
      }),
    };

    updateFoodsAndBroadcast((current) =>
      current.map((item) =>
        item.id === rejectingFoodId
          ? {
              ...item,
              status: "Available",
              claimedBy: "",
              pickupStage: "None",
              pickupCode: "",
              requestDetails: null,
              rejectedHistory: [rejectedEntry, ...(item.rejectedHistory || [])],
            }
          : item
      )
    );

    setRejectingFoodId(null);
    showBanner(`Request declined. Listing reopened for other verified NGOs.`, "warning");
  }

  // Update Pickup Stage -> Email Donor when volunteer is on the way
  function updatePickupStage(id, nextStage) {
    const food = foods.find((item) => item.id === id);
    if (!food) return;

    if (nextStage === "ReadyForPickup") {
      const activeUser = currentUser || { email, name, role };
      if (!checkDonorOwnership(food, activeUser)) {
        showBanner("Permission denied: You can only update your own listings.", "error");
        return;
      }
    }

    updateFoodsAndBroadcast((current) =>
      current.map((item) =>
        item.id === id ? { ...item, pickupStage: nextStage } : item
      )
    );

    if (nextStage === "VolunteerEnRoute" && food) {
      sendStepEmail({
        step: "volunteer_en_route",
        donorEmail: food.donorEmail || "annasetu0@gmail.com",
        donorName: food.donor,
        ngoEmail: email.trim(),
        ngoName: name.trim(),
        foodTitle: food.name,
        pickupAddress: food.address,
        volunteerName: food.requestDetails?.volunteerName || "Rescue Volunteer",
        volunteerPhone: food.requestDetails?.contactPhone || "",
      });
      showBanner("Status updated: Volunteer En Route! Notification email sent to Donor.");
    } else {
      showBanner("Pickup status updated.");
    }
  }

  // Complete Handover (OTP Verified) -> Sends Confirmation Emails to BOTH Parties
  async function completeCollection(e) {
    e.preventDefault();
    if (!verifyingCollectionId) return;

    const food = foods.find((item) => item.id === verifyingCollectionId);
    if (!food) return;

    const activeUser = currentUser || { email, name, role };
    if (!checkDonorOwnership(food, activeUser)) {
      showBanner("Permission denied: Only the listing donor kitchen can verify handover.", "error");
      return;
    }

    const cleanEntered = enteredOtp.trim();
    const cleanPickupCode = String(food.pickupCode || "").trim();
    if (!cleanEntered || !cleanPickupCode || cleanEntered !== cleanPickupCode) {
      showBanner(
        "Invalid Pickup OTP. Please ask the rescue NGO volunteer for the correct 4-digit code.",
        "error"
      );
      return;
    }

    const timestamp = new Date().toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
    });

    updateFoodsAndBroadcast((current) =>
      current.map((item) =>
        item.id === verifyingCollectionId
          ? {
              ...item,
              status: "Collected",
              pickupStage: "HandedOver",
              collectedAt: timestamp,
            }
          : item
      )
    );

    // Send Completion Email to BOTH Parties
    sendStepEmail({
      step: "handover_completed",
      donorEmail: email.trim(),
      donorName: name.trim(),
      ngoEmail: food.requestDetails?.ngoEmail || "annasetu0@gmail.com",
      ngoName: food.claimedBy,
      foodTitle: food.name,
      quantity: food.quantity,
      unit: food.unit,
      weightKg: food.estimatedWeightKg,
      otp: food.pickupCode,
    });

    setVerifyingCollectionId(null);
    setEnteredOtp("");
    showBanner(`Verified handover completed! Confirmation emails sent to both parties.`);
  }

  function confirmNgoReceipt(id) {
    const timestamp = new Date().toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
    });

    updateFoodsAndBroadcast((current) =>
      current.map((item) =>
        item.id === id
          ? {
              ...item,
              status: "Collected",
              pickupStage: "HandedOver",
              collectionConfirmedByNgo: true,
              collectedAt: item.collectedAt || timestamp,
            }
          : item
      )
    );
    showBanner("Delivery receipt confirmed by NGO! Thank you for rescuing this food.");
  }

  function handleRateCollection(foodId, stars, customRatingType = null) {
    const ratingField = customRatingType || (role === "donor" ? "ngoRating" : "donorRating");
    const ratedByRole = ratingField === "donorRating" ? "NGO" : "Donor";
    const partyLabel = ratingField === "donorRating" ? "Food Donor" : "Rescue Partner";

    const ratingData = {
      stars,
      ratedBy: name.trim() || (ratedByRole === "NGO" ? "Rescue NGO" : "Food Donor"),
      ratedByRole,
      ratedAt: new Date().toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
      }),
    };

    updateFoodsAndBroadcast((current) =>
      current.map((item) => {
        if (item.id !== foodId) return item;
        return {
          ...item,
          [ratingField]: ratingData,
          rating: ratingData,
        };
      })
    );
    showBanner(`Handover rated ${stars} Stars for ${partyLabel}! Quality audit updated.`, "success");
  }

  function toggleAvailability(id) {
    const food = foods.find((item) => item.id === id);
    const activeUser = currentUser || { email, name, role };
    if (!food || !checkDonorOwnership(food, activeUser)) {
      showBanner("Permission denied: You can only modify your own listings.", "error");
      return;
    }

    if (food.status === "Available") {
      updateFoodsAndBroadcast((current) =>
        current.map((item) =>
          item.id === id
            ? { ...item, status: "Unavailable", unavailableReason: "Paused by donor" }
            : item
        )
      );
      showBanner("Listing marked Unavailable.", "warning");
    } else {
      updateFoodsAndBroadcast((current) =>
        current.map((item) =>
          item.id === id ? { ...item, status: "Available", unavailableReason: "" } : item
        )
      );
      showBanner("Listing re-opened!");
    }
  }

  function removeFood(id) {
    const food = foods.find((item) => item.id === id);
    const activeUser = currentUser || { email, name, role };

    if (!food || !checkDonorOwnership(food, activeUser)) {
      showBanner("Permission denied: You can remove only your own listings.", "error");
      setConfirmRemove(null);
      return;
    }

    updateFoodsAndBroadcast((current) => current.filter((item) => item.id !== id));
    setConfirmRemove(null);
    showBanner("Listing removed.", "warning");
  }

  // Intelligent Multi-Factor Matching Recommendations for Donors (BONUS01)
  const topMatches = useMemo(() => {
    if (role !== "donor") return {};
    const allNgos = [
      ...SEED_NGOS,
      ...registeredUsersList.filter((u) => u.role === "ngo"),
    ];
    const matchMap = {};
    const activeUser = currentUser || { email, name, role };
    foods.forEach((item) => {
      if (item.status === "Available" && checkDonorOwnership(item, activeUser)) {
        const ranked = rankNgoMatches(item, allNgos);
        if (ranked.length > 0) {
          matchMap[item.id] = ranked[0];
        }
      }
    });
    return matchMap;
  }, [foods, role, registeredUsersList, currentUser, email, name]);

  // Filter and sort listings with strict isolation and PIN code prioritization (BONUS01)
  const visibleFoods = useMemo(() => {
    const activeUser = currentUser || { email, name, role };
    const userEmail = (activeUser.email || "").trim().toLowerCase();
    const trimmedName = (activeUser.name || "").trim().toLowerCase();

    const filtered = foods.filter((food) => {
      // Donors strictly see ONLY their own published listings (isolated by ID & Email)
      if (role === "donor") {
        return checkDonorOwnership(food, activeUser);
      }

      // NGOs see available listings or their own requests
      const expired = isPickupExpired(food.pickup);
      const effectiveStatus =
        expired && food.status === "Available" ? "Unavailable" : food.status;

      const isMyNgoRequest =
        (food.requestDetails?.ngoEmail && userEmail && food.requestDetails.ngoEmail.toLowerCase() === userEmail) ||
        (food.claimedBy || "").toLowerCase() === trimmedName ||
        (food.rejectedHistory || []).some(
          (r) => (r.ngoName || "").toLowerCase() === trimmedName
        );

      if (
        hideUnavailable &&
        (effectiveStatus === "Unavailable" || effectiveStatus === "Collected")
      ) {
        return false;
      }

      if (filter === "All") {
        // Show Available food, OR listings claimed by this NGO
        // Hide items claimed by other NGOs to protect volunteer privacy
        return effectiveStatus === "Available" || isMyNgoRequest;
      }

      if (filter === "My Requests") {
        return isMyNgoRequest;
      }

      return effectiveStatus === filter;
    });

    // Proximity & Urgency Ranking: Prioritize same PIN code first, then urgent (<90m), then newest
    return filtered.sort((a, b) => {
      if (role === "ngo" && pincode) {
        const aSamePin = String(a.pincode).trim() === String(pincode).trim();
        const bSamePin = String(b.pincode).trim() === String(pincode).trim();
        if (aSamePin && !bSamePin) return -1;
        if (!aSamePin && bSamePin) return 1;
      }

      const aMins = getRemainingMinutes(a.pickup);
      const bMins = getRemainingMinutes(b.pickup);
      if (a.status === "Available" && b.status === "Available" && aMins !== bMins) {
        return aMins - bMins;
      }

      return (b.id || 0) - (a.id || 0);
    });
  }, [foods, role, name, email, currentUser, hideUnavailable, filter, pincode]);

  // Scoped Impact Metrics for the logged in user
  const impact = useMemo(() => {
    const activeUser = currentUser || { email, name, role, pincode, id: "" };
    return calculateImpactMetrics(
      foods,
      role,
      activeUser.name || name,
      activeUser.pincode || pincode,
      requisitions,
      activeUser.email || email,
      activeUser.id || ""
    );
  }, [foods, role, name, pincode, requisitions, currentUser, email]);

  if (page === "splash") {
    return (
      <main className="splash-screen">
        <div className="splash-content">
          <div className="splash-logo">✳</div>
          <h1>
            AnnaSetu <span>Platform</span>
          </h1>
          <p>Less waste. More hope.</p>
          <div className="splash-loader">
            <span />
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="app">
      <nav className="navbar">
        <a
          className="brand"
          href="#home"
          onClick={(e) => {
            e.preventDefault();
            if (!currentUser) setPage("home");
          }}
        >
          <span className="brand-icon">✳</span>
          AnnaSetu
        </a>

        <div className="nav-actions">
          {page === "admin" ? (
            <>
              <span className="admin-status-pill">
                {isAdmin ? "🛡️ Regulatory Admin Session" : "🛡️ Admin Restricted"}
              </span>
              <button className="text-button" onClick={handleAdminLogout}>
                {isAdmin ? "Exit Admin" : "← Home"}
              </button>
            </>
          ) : (
            <>
              {currentUser && (
                <>
                  <button
                    type="button"
                    className="nav-account-btn"
                    onClick={() => openAccountModal("profile")}
                    title="Account Details, Edit Profile & Manage Multiple Properties"
                  >
                    <span>👤</span>
                    <span>{currentUser.name || "Account"}</span>
                    <span className="nav-account-tag">
                      🏢 {getUserBranches(currentUser).length} {getUserBranches(currentUser).length === 1 ? "Branch" : "Branches"}
                    </span>
                  </button>
                  <span className="verified-user-badge">
                    ✓ {currentUser.role === "donor" ? "Donor" : "NGO"} · PIN {currentUser.pincode || "240494"}
                  </span>
                  <button
                    type="button"
                    className="nav-account-btn"
                    onClick={() => {
                      setPage("dashboard");
                      setDashboardTab("plans");
                    }}
                    title="View Membership Plans & Subscription Status"
                  >
                    <span>💎</span>
                    <span>
                      {userSubStatus === "active"
                        ? "Pro Member"
                        : userSubStatus === "pending"
                        ? "Pending Approval"
                        : userSubStatus === "rejected"
                        ? "Payment Flagged"
                        : userSubStatus === "due"
                        ? "Payment Due"
                        : "Free Trial"}
                    </span>
                  </button>
                </>
              )}
              {page === "dashboard" && (
                <button className="text-button" onClick={handleLogout}>
                  Sign out
                </button>
              )}
            </>
          )}
        </div>
      </nav>

      {page === "home" ? (
        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow">
              <span className="live-dot" />
              <Typewriter phrases={EYEBROW_PHRASES} speed={65} pause={2500} />
            </div>

            <h1>
              Good food.
              <br />
              <span className="hero-typed-accent">
                <Typewriter phrases={HEADLINE_TYPED_PHRASES} speed={85} pause={2200} />
              </span>
            </h1>

            <p className="description">
              Connecting commercial surplus food with verified local NGOs. Verified FSSAI
              food business operators, real-time OTP verification, and instant PIN code neighborhood alerts.
            </p>

            <div className="impact">
              <div>
                <strong>{impact.mealsRedistributed}+</strong>
                <small>Meals redistributed</small>
              </div>
              <div>
                <strong>{impact.wasteAvoidedKg} kg</strong>
                <small>Food waste avoided</small>
              </div>
            </div>

            {/* Authentication Form Box */}
            <div className="login-form">
              {/* Liquid Glass Auth Mode Toggle Switcher */}
              <div className="switcher" role="radiogroup" aria-label="Account Mode" c-previous={prevAuthOption}>
                <label className="switcher__option">
                  <input
                    className="switcher__input"
                    type="radio"
                    name="authModeRadio"
                    value="login"
                    c-option="1"
                    checked={authMode === "login"}
                    onChange={() => {
                      setPrevAuthOption(authMode === "login" ? "1" : "2");
                      setAuthMode("login");
                      setNotice("");
                    }}
                  />
                  <span className="switcher__label">
                    <svg className="switcher__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                      <polyline points="10 17 15 12 10 7" />
                      <line x1="15" y1="12" x2="3" y2="12" />
                    </svg>
                    <span>Sign In</span>
                  </span>
                </label>
                <label className="switcher__option">
                  <input
                    className="switcher__input"
                    type="radio"
                    name="authModeRadio"
                    value="register"
                    c-option="2"
                    checked={authMode === "register" || authMode === "verify_otp"}
                    onChange={() => {
                      setPrevAuthOption(authMode === "register" ? "2" : "1");
                      setAuthMode("register");
                      setNotice("");
                    }}
                  />
                  <span className="switcher__label">
                    <svg className="switcher__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                      <circle cx="8.5" cy="7" r="4" />
                      <line x1="20" y1="8" x2="20" y2="14" />
                      <line x1="23" y1="11" x2="17" y2="11" />
                    </svg>
                    <span>Create Account</span>
                  </span>
                </label>
                <div className="switcher__filter">
                  <svg>
                    <filter id="switcher" primitiveUnits="objectBoundingBox">
                      <feImage
                        result="map"
                        width="100%"
                        height="100%"
                        x="0"
                        y="0"
                        href="data:image/webp;base64,UklGRq4vAABXRUJQVlA4WAoAAAAQAAAA5wEAhwAAQUxQSOYWAAABHAVpGzCrf9t7EiJCYdIGTDpvURGm9n7K+YS32rZ1W8q0LSSEBCQgAQlIwEGGA3CQOAAHSEDCJSEk4KDvUmL31vrYkSX3ufgXEb4gSbKt2LatxlqIgNBBzbM3ikHVkvUvq7btKpaOBCQgIRIiAQeNg46DwgE4oB1QDuKgS0IcXBykXieHkwdjX/4iAhZtK3ErSBYGEelp+4aM/5/+z14+//jLlz/++s/Xr4//kl9C8Ns8DaajU+lPX/74+viv/eWxOXsO+eHL3/88/ut/2b0zref99evjX8NLmNt1fP7178e/jJcw9k3G//XP49/Iy2qaa7328Xkk9ZnWx0VUj3bcyCY4Pi7C6reeEagEohnRCbQQwFmUp9ggYQj8MChjTSI0Ck7G/bh6P5ykNU9yP+10G8I2UAwXeQ96DQwNjqyPu/c4tK+5CtGOK0oM7AH5f767lHpotXVYYI66B+HjMhHj43C5wok3YDH4/vZFZRkB7rNnEfC39WS2Q3K78y525wFNTPf5f+/fN9YI1YyDvjuzV5rQtsfn1Ez1ka3PkeGxOZ6IODxDJqCLpF7vdb9Z3s/ufLr6jf/55zbW3LodwwVVg7Lmao+p3eGcqDFDGuuKnlBZAPSbnkYtTX+mZl2y57Gq85F3tDv7m7/yzpjXHoVA3YUObsHz80W3IUK1E8yRqggxTMzD4If2230ys7RDxWrLu9o9GdSWNwNRC2yMIg+HkTVT3BOZER49XLBMdljemLFMjw8VwZ8OdBti4lWdt7c7dzaSc5yILtztsTMT1GFGn/tysM23nF3xbOsnh/eQGKkxhWGEalljCvWZ+LDE+9t97uqEfb08rdYwZGhheLzG2SJzKS77OIAVgPDjf9jHt6c+0mjinS/v13iz9RV3vsPdmbNG1E+nD6s83jBrBEnlBiTojuJogGJNtzxtsIoD2CFuXYipzhGWHhWqCBSqd7l7GMrnuHzH6910FO+XYwgcDxoFRJNk2GUcpQ6I/GhLmqisuBS6uSFpfAz3Yb9Yatyed7r781ZYfr3+3FfXs1MykSbVcg4GiOKX19SZ9xFRwhG+UZGiROjsXhePVu12fCZTJ3CJ4Z3uXnyxz28RutHa5yCKG6jgfTBPuA9jHL7YdlAa2trNEr7BLANd3qNYcWZqnkvlDe8+F5Q/9k8jCFk17ObrIf0O/5U/iDnqcqA70mURr8FUN5pmQEzDcxuWvOPd1+KrbO4fd0vXK5OTtYEy5C2TA5L4ok6Y31WHR9ZR9lQr6IjwruSd775W6NVa2zz1fir2k1GWnT573Eu3mfMjIikYZkM4MDCnTWbmLrpK/Hs0KD5C8rZ3n0tnw0j76WuU8P1YBIjsvcESbnOQMY+gGC/sd/gG+hKKtDijJHhrcSj/GHa/FZ8oGLXeLx1IW+cgU8pqD0PzMzU3oG5lQ/ZaDPDMYq+aAPSEmHN+JiVIp0haHTvPt77732z5ed2K7NHs9FtCIk4BdNkKLRLvOKlFcw+UiovM4OB5sGgepyML+a4TEu/I29/dFtjJulojJR4Tg71ybApEdca0TSnaumNJyCWH2pjENASlQS/NIXMWtiPV9CHsvuftev08/lemYIcUnHSu6XEMvaBq41tqf/m0siLj7xeXsnBmhxY5z+nCwX4Iu4euTPaE4EQorgogisHrBtsAMdX+Huje7nlx3hMpKovdf+YftDQqytChXfEh7D5nyC8rzNTICINmpK5Ni0ngcAMzpmiYDwOMtmUTiCjvx2S2dIeSguP/QHZ3xYIeGhTt1CsCOIiEuVw8pGjVznDJppuojl30i9RvXccXzmXGj2b3H3XM38c/PZseyeOdplXhFekzZMZ2fUGuIBsKCcgQg4Ikqt4PDTkQiWQtMUBFAEhUH8vuvoAvnvGMCEP4/vMmZA2PnkmAJsQsHeFAIk43F00OS3sa/1TDJTPss2698T+i3V22L3PsIeFAHmWWi1FUh29TqpniVOt5hGA/q40Yubt4yXDEQomvldUNhfuuSvjHzPBysYhBMSmRrpuIUHJhQk5uw5V4EwpMp1NvklGkc03WYeC0KETcZ409HkEcwnEaE3EdNnIcfCb1jjWNfZyhhGH48AvsJ4WL+mYTM5i+yFNyM6PhbkuMGYREv48VihVyHXb9RjoE0HvoOuaO7fxxUYnQj1wB0DOZUagcEXfVkJ/nBgV+vl5yMfFaJs0myb9BjyNSsY9FbwZNq21wEFOEJ8Pk/vO1fSa6bOPZFCMc7grz9YXf8rBBPaK3qUJEfJG1A8nuytO1jg8CvWGEY1Z4o1gb3uEjILmNm5YfMXH3GtvyETX+j4jAXkkaA7FDQIdPzLZOcUJsqLQFxboX/MZ95f7MqPku/6IAGXer6xchZyiqcG2Tw4oSVcO0Q0vqOlmEcpsyBw2pwzcifb6t2th64vASkXGXzY9U7aFvkqJEOWSkEU0oL0FrnOfr432tJ5OtPUG1T0cg5yqNTNFAqKFxl80fxGGPFzIiASv+sEPaGMmewBjUEZNFtVCwzaG3PVSe5l+AIRNeFCzu2+H/7Cp2pbOjRUjNFFMX8ZEGl0D4uNWi4ykocIgBkGF+HAIHRNjAqioi4y7vjPtlTPTMXwl7aQD7gu9yVk+VdBwmVMnljIx4++8hq0qOtmjkwT1+RW4N0LhPQuahKrjGVIMy2hW3lgO8lqoLLBHAaTvRIgaPLNFx5ChJ8hTcsBdO383ouHspeqwelcvfEOELFMF0a+jWZJzZYWqZQlj9FnUeMq37zGWfbwRbvkDKOR0OKzAUNO5y8O+H24nczTdDZniPDwMUgIJDV1sEJn7xWMscorAcT3niXE+kcQS0NUMjkkoiNu43cbvQGGagTd6ycWgkkPbSb0Fi0iiYKTpXlKyTCKKHsWssGuM4dhzIaZqIjXvg2w1xqK8sqkQKhJUqWoGxcXTK4gi12ecTaa8+jmMYItoS41KhA4pbAWS2MyLk3n/lS0c4Cq4KcdLYTv4c3OPQZWJx+B9dSytYPUmGUKbKpg+Oy/g0iGuMDw+WRMjdCftaM30PxVSEW8Y6IeUpcGDoTFyDExFIC0coBCNDjx8XXBMWW53qAz2LgJA7G/zPcBcq5mjyfMo/dYTJMBQ3mkxItV2HHpsltIs49LLZK4w6TscoK/1x8FCEkPvP90Y3XVDu468z/HBkAdUMZLNwt3AqNiHOLQM/EYqMbxAWcgW1Rd5PFOnuX08+iNwt7wFWBWYdpDb3F5inFIe4vlXFLkUO3zVjzvJJWXGJOhyBSxV4O8z1FPBmVgZA7p+Ov5oh0XYD5DazDBODdJHHK3O3U5k2REDOWh7ZQSw6fDLBl4P4hixhuzJpGLmv9Ok/12dnFEMDomZm9pikmMevpvEAvZSq1rPziRSaXHMokc0TwRInpAVh5B7os8LBX4+z8rYaZxxQViQ7bndIOnucpgFahg7nBRTv9mUP1epZ+zzFYkXJvfvxUmkdewGhR3FtEE5gGUdAz8DbBFDQypm3jgUlFMru4RG5VIXGaThK7uZnNNDVq3igkGgQVnnSqodKgLGNEPnkAH3YgM0ABowQ5RsDpa4C8wuMrXP8JeioiBC5//ltLZOuePmXgZauU9FcpsvPvYH5yWt8P65HuRjLI62+zmNH28fZZ4odgbjp6AswlNzd74PbIkojkpXSKKF8h79BOJxhZFhDeSWAvb3D5jw2NtUDppI4eRSg5L7+5bTUdm0e7FZh2BgmZdVY/+WE7DLuqWZm3YvOEoQ0WcIIlI8bckcO2SkgZcHI/f63KJb0uWUR6gtorxgCE5ytH3wRr3kiWHlcdGk/SZO0UU+RYuFrCTjCdUAwGdEouf//Si1AhNmg7ZFRuMR+5qeQAaAdwKrG5O5pUnNAa8Ecb9Y2b6B8Rejwcffv5ii5h69Dhm55nhpJ3o/FYpTL1AWgmLIAG4t3qK8ocYnXxF06Fe0Dtv9kvv/LJZTcg/D4OB1FEtaC+mvh3RNhPLlOg3QniC0jov2Qjw3adeA/2GAIohAxCwSGlTsJ+pkOHU6K0EyY5osnN6tVyv56/OJNAOP9Kvi1wZx55EIcz0F2IYWAkvvDRypWSXUuGExX4QjQt4o5ptXHEaXK4z5RYV1C7cs6aLTigJYW8Lwcrv/R9cHuLsl1cfKzRlB5hgWzp/tpPDUF2sWA4tApdUKqSRX+TTogKnATAH44OLk7d36DCknABBAqTWQQz1QgQeq3EImJiwWdYSahYYXVOJmPCa6LqAvdEojcVT+xjjtNZoCcsYRHnvdK7bf2GreoKKsKDtgn5emh3lGmCdDzkDJPGid3PFAb/Bbwj1MCf2pdZqkSUBwWXgGpLWaUEjFG+0PmcDzclQBH2FDsA+UcILmHrzrHY6DKev0bBOYPD6lGy0Nw60gIAeP8HXWq0vZo5rbFGsYXSDtNb+QnSu7hPyLzvfMcaBTM2oF6rLx2CQaaYSljdEeodTvY2uqwUYvPtFlqNo0wxoWSu/8rQgNHO9WjggPFdxIG3socz0BCkQY1umhJ1oHI/lta72+zuU9tESX3+5++GF3dZeON4RZCnaoHjExonNAkjSXSyOtbbjmATzeZJBoWDR202FweApL78uWpYAitcpVDELbG9a7R9zukHUYYLTBBrysZM7cj0rgs1lgo1EXNwwmS+W50s70L7Wv5q8x2hWw5eS3+Qx1Nf7n9d/v/lU+d3s9N5gN931c5rN5yN6gKz+Z3r/i00h/e+Y+D09Nn1f5062v8e7+9881v23/V/dF2e27b/89539352e82/1Z/4z3+17t8+l/e4f71/3b+7/c97b87/v/vdP+d3/96v83/3/q93f/w7+Zf1H29/73/3T+3/c97T+1/y/+d7f/Zf9P/9/1//vfvP7j9n/q/rf/c//H+b/uf7j/N//T+9f7v+4/sP9v+V//L+9f7v+7/1f3r/f/n//x93f+X/9P7v+7/2P+n/9/7r/s/6v/1/m/7r+w/1P/r/vf/Z/7v/9/pv9v+q/7v/c/1//tf6X/5/3P9f/2//V//L+9/rP/u//b/f/2f+z//b/f/3//N/3f/8//b/f/3/+d/0v/7f9T/6f9j/5f/1/3//u//j/u/9//w//n/c/97/9v/w//P/b//T/uv+9/3f/8//P/bv/d//v/+/53/9P/5/43///d//b/8f/x/3f///b/9v/5//v/+/53///v/9//9v/2//d///7/vv//+//f///f//7/9///9///9///+//f///f///9///+//v/7v/9//rv/f///b/9///7/vf/d//f/8f/v/9f/6f/X/+X/7f/b//H/4v/R//T//v/t/97/4P/v//f/7//v/8r/vv+1/4//yv/p/8H/sv/O/+r///b//f/j/+z///7//f/x//r/0v+y/6f/qv+3/9D/8v///v///P/n/+7/5v/x/+j/3f/h//f//f/2//H/8v/g/9v/3f/W/8n/r/+u/57/jv+W/6X/wv/G/7T/uf/D/9r/7f/g/+b/4//V/77/xf/R/8P/rv+0/6n/rf/C/8z/rv/C/+H/4//p/9f/uv+y/5z/k/+F/4P/pv/K/+f/3v+5/8H/1f/U/8b/rv+m/6T/ov+L/4X/nv/E/+D/5v/N/7f/qv+c/4n/e/97/6f/yv/a/7v/mP+f/5v/uv+d/4n/lf+t/6r/rv+n/6f/pf+X/5P/fv9o/3D/eP95/2b/ef9z/3D/kv+t/7z/zP+e/6P/mP+J/1n/U/91/4v/kv9m/3n/ef9v/3T/ef92/2P/RP88/1D/dP+D/4T/hP92/1z/bf+C/4b/fv9h/1f/TP84/y3/Rv9V/0j/S/9i/2H/WP9Y/17/Xv9n/17/UP87/0H/Q/80/0T/Rv83/0j/Of9F/z3/Kf8j/z3/Pv8z/yT/D/8c/xb/Gv8R/yL/Jf8e/wv/Cv8M/wD/Gv8W/w3/D/8L/wL/FP8R/wT/9P7v/vP/Af8V/wr/DP8E//X+6f7t/v7/Df8J/wb/CP8J/wz/Cf8F/wz/Cv8D//r+8/72/wL/8f7i/tv+9f/z/uv+1P7Y/vf+7/7T/tv+1f7e/t3+2P7c/s/+3P7l/uP+2v7b/uj+5v7m/vD+7/73/gD//f7t/uv+6v73/vb+7f7p/vj+Af///fv9+v7+/gL/9v75/vT+7/72/vn+7P7r/vv+AgD+/fv+8/73/gAA9/77/vf+9P74/gAA9v70/vr+//78/e795f3n/eP95/3Y/cL9pv21/dv97/3v/fP9AQAAAAA="
                      />
                      <feGaussianBlur in="SourceGraphic" stdDeviation="0.01" result="blur" />
                      <feDisplacementMap id="disp" in="blur" in2="map" scale="0.5" xChannelSelector="R" yChannelSelector="G" />
                    </filter>
                  </svg>
                </div>
              </div>

              {/* Mode 1: Log In */}
              {authMode === "login" && (
                <form onSubmit={handleLoginSubmit}>
                  <div className="role-label">CHOOSE YOUR ACCOUNT TYPE</div>

                  <div className="role-options">
                    <button
                      type="button"
                      className={`role-card ${role === "donor" ? "selected" : ""}`}
                      onClick={() => {
                        setRole("donor");
                        setNotice("");
                      }}
                    >
                      <span className="role-emoji">🍲</span>
                      <span>
                        <b>Food Donor</b>
                        <small>Restaurant, hostel, canteen</small>
                      </span>
                    </button>

                    <button
                      type="button"
                      className={`role-card ${role === "ngo" ? "selected" : ""}`}
                      onClick={() => {
                        setRole("ngo");
                        setNotice("");
                      }}
                    >
                      <span className="role-emoji">💚</span>
                      <span>
                        <b>Rescue NGO</b>
                        <small>Shelter & relief charity</small>
                      </span>
                    </button>
                  </div>

                  <div className="demo-btn-row">
                    <button
                      type="button"
                      className={`demo-preset-btn ${role === "donor" ? "active" : ""}`}
                      onClick={() => autoFillDemo("donor")}
                    >
                      🍔 Demo: McDonald's (Donor)
                    </button>
                    <button
                      type="button"
                      className={`demo-preset-btn ${role === "ngo" ? "active" : ""}`}
                      onClick={() => autoFillDemo("ngo")}
                    >
                      💚 Demo: Feeding India (NGO)
                    </button>
                  </div>

                  <label htmlFor="login-email">Email address</label>
                  <input
                    id="login-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={role === "donor" ? "mcdonalds@cprl.in" : "rescue@feedingindia.org"}
                    autoComplete="email"
                    required
                  />

                  <label htmlFor="login-password">Password</label>
                  <input
                    id="login-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    autoComplete="current-password"
                    required
                  />

                  {notice && (
                    <p className="form-notice" role="alert">
                      {notice}
                    </p>
                  )}

                  <button
                    className="box start-btn primary-submit-btn"
                    type="submit"
                    style={{ "--w": "100%", "--h": "58px", "--tr": "15%", marginTop: "20px" }}
                  >
                    <span className="text">
                      {role === "donor" ? "Sign In as Food Donor" : "Sign In as Rescue NGO"}
                    </span>
                    <CapsuleChevron />
                    <div className="circle-overlay" />
                  </button>
                </form>
              )}

              {/* Mode 2: Register New Account */}
              {authMode === "register" && (
                <form onSubmit={handleRegisterSubmit}>
                  <div className="role-label">CHOOSE YOUR ACCOUNT TYPE</div>

                  <div className="role-options">
                    <button
                      type="button"
                      className={`role-card ${role === "donor" ? "selected" : ""}`}
                      onClick={() => {
                        setRole("donor");
                        setNotice("");
                      }}
                    >
                      <span className="role-emoji">🍲</span>
                      <span>
                        <b>Food Donor</b>
                        <small>Restaurant, hostel, canteen</small>
                      </span>
                    </button>

                    <button
                      type="button"
                      className={`role-card ${role === "ngo" ? "selected" : ""}`}
                      onClick={() => {
                        setRole("ngo");
                        setNotice("");
                      }}
                    >
                      <span className="role-emoji">💚</span>
                      <span>
                        <b>Rescue NGO</b>
                        <small>Shelter & relief charity</small>
                      </span>
                    </button>
                  </div>

                  <div className="demo-btn-row">
                    <button
                      type="button"
                      className={`demo-preset-btn ${role === "donor" ? "active" : ""}`}
                      onClick={() => autoFillDemo("donor")}
                    >
                      🍔 Auto-fill McDonald's (Donor Demo)
                    </button>
                    <button
                      type="button"
                      className={`demo-preset-btn ${role === "ngo" ? "active" : ""}`}
                      onClick={() => autoFillDemo("ngo")}
                    >
                      💚 Auto-fill Feeding India Demo
                    </button>
                  </div>

                  {/* Donor establishment name */}
                  {role === "donor" && (
                    <>
                      <label htmlFor="reg-name">Establishment / Restaurant / Hostel Name</label>
                      <input
                        id="reg-name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="e.g. McDonald's or Rajbog Restaurant"
                        required
                      />
                    </>
                  )}

                  {/* NGO Name and Registration Number at the SAME level */}
                  {role === "ngo" && (
                    <div className="form-grid">
                      <label htmlFor="reg-ngo-name">
                        Registered NGO Name
                        <input
                          id="reg-ngo-name"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          placeholder="e.g. Feeding India Charity Trust"
                          required
                        />
                      </label>

                      <label htmlFor="reg-ngo-no">
                        NGO Registration Number
                        <input
                          id="reg-ngo-no"
                          value={registrationNo}
                          onChange={(e) => setRegistrationNo(e.target.value)}
                          placeholder="e.g. DL/2019/0246221"
                          required
                        />
                        <div className="validation-feedback">
                          {registrationNo ? (
                            validNgoRegistration(registrationNo) ? (
                              <span className="valid-pill">✓ Valid Indian NGO Registration Format</span>
                            ) : (
                              <span className="pending-pill">⚠️ Format: ST/YYYY/NNNNNNN (Darpan ID) or Trust ID</span>
                            )
                          ) : (
                            <span className="pending-pill">Format: DL/2019/0246221 (NITI Aayog Darpan / Trust)</span>
                          )}
                        </div>
                      </label>
                    </div>
                  )}

                  <label htmlFor="reg-email">Email address</label>
                  <input
                    id="reg-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                  />

                  <div className="form-grid">
                    <label htmlFor="reg-password">
                      Password
                      <input
                        id="reg-password"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Min 6 characters"
                        minLength={6}
                        required
                      />
                    </label>

                    <label htmlFor="reg-pincode">
                      Local PIN Code
                      <input
                        id="reg-pincode"
                        value={pincode}
                        onChange={(e) => setPincode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                        placeholder="6-digit PIN code"
                        maxLength={6}
                        required
                      />
                    </label>
                  </div>

                  <label htmlFor="reg-address">Street / Area Address</label>
                  <input
                    id="reg-address"
                    value={userAddress}
                    onChange={(e) => setUserAddress(e.target.value)}
                    placeholder="Area, Sector, City"
                    required
                  />

                  {/* FSSAI License & Direct Portal Name Match Validation (NO AI) */}
                  {role === "donor" && (
                    <>
                      <div className="form-grid">
                        <label htmlFor="reg-fssai">
                          14-Digit FSSAI License Number
                          <input
                            id="reg-fssai"
                            value={fssaiNumber}
                            onChange={(e) =>
                              setFssaiNumber(e.target.value.replace(/\D/g, "").slice(0, 14))
                            }
                            placeholder="14-digit FSSAI (e.g. 10014011001648)"
                            maxLength={14}
                            required
                          />
                          <div className="validation-feedback">
                            {fssaiNumber ? (
                              validFSSAI(fssaiNumber) ? (
                                <span className="valid-pill">✓ 14-Digit FSSAI Format Verified</span>
                              ) : (
                                <span className="pending-pill">⚠️ Must be 14 digits ({fssaiNumber.length}/14)</span>
                              )
                            ) : (
                              <span className="pending-pill">Enter 14-digit FoSCoS license</span>
                            )}
                          </div>
                        </label>

                        <label htmlFor="reg-fssai-name">
                          Registered Operator Name on FSSAI License
                          <input
                            id="reg-fssai-name"
                            value={fssaiName}
                            onChange={(e) => setFssaiName(e.target.value)}
                            placeholder="Must match establishment name exactly"
                            required
                          />
                          <div className="validation-feedback">
                            {fssaiName && name ? (
                              checkFssaiMatch(name, fssaiName) ? (
                                <span className="valid-pill">✓ Name Identity Match Verified</span>
                              ) : (
                                <span className="pending-pill">⚠️ Name does not match establishment name</span>
                              )
                            ) : null}
                          </div>
                        </label>
                      </div>
                      <div className="fssai-portal-notice">
                        🛡️ <b>Portal Rule:</b> FSSAI registered name and establishment name must match identically to authenticate real food operator status.
                      </div>
                    </>
                  )}

                  {notice && (
                    <p className="form-notice" role="alert">
                      {notice}
                    </p>
                  )}

                  <button
                    className="box start-btn primary-submit-btn"
                    type="submit"
                    disabled={isSendingOtp}
                    style={{ "--w": "100%", "--h": "58px", "--tr": "15%", marginTop: "20px" }}
                  >
                    <span className="text">
                      {isSendingOtp ? "Sending Verification Code..." : "Create Account & Verify"}
                    </span>
                    <CapsuleChevron />
                    <div className="circle-overlay" />
                  </button>
                </form>
              )}

              {/* Mode 3: Enter 6-Digit Verification OTP */}
              {authMode === "verify_otp" && (
                <div className="otp-activation-card">
                  <span style={{ fontSize: "36px" }}>🔐</span>
                  <h2>Verify Your Email</h2>
                  <p>
                    A real 6-digit activation code was sent via Gmail to{" "}
                    <strong>{pendingUserPayload?.email}</strong>. Enter it below to activate your account.
                  </p>

                  <form onSubmit={handleVerifyOtpSubmit}>
                    <input
                      className="otp-input-field"
                      value={regOtp}
                      onChange={(e) => setRegOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      placeholder="000000"
                      maxLength={6}
                      autoFocus
                      required
                    />

                    {notice && (
                      <p className="form-notice" role="alert">
                        {notice}
                      </p>
                    )}

                    <div className="confirm-actions">
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => setAuthMode("register")}
                      >
                        ← Back
                      </button>
                      <button
                        className="box start-btn primary-submit-btn"
                        type="submit"
                        style={{ "--w": "100%", "--h": "58px", "--tr": "15%" }}
                      >
                        <span className="text">Verify & Activate Account</span>
                        <CapsuleChevron />
                        <div className="circle-overlay" />
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </div>
          </div>

          <div className="hero-visual">
            <div className="visual-orb orb-one" />
            <div className="visual-orb orb-two" />
            <div className="food-art">
              <span>🥗</span>
            </div>
            {/* Restored Original Floating Cards */}
            <div className="floating-card card-top">
              <span className="mini-icon">♡</span>
              <div>
                <b>Food deserves a future.</b>
                <small>Every meal matters</small>
              </div>
            </div>
            <div className="floating-card card-bottom">
              <span className="check-icon">✓</span>
              <div>
                <b>Verified Handover</b>
                <small>Real-time NGO pickup tracking</small>
              </div>
            </div>
            <p className="visual-caption">
              Nourish people. Nurture the planet.
            </p>
          </div>
        </section>
      ) : page === "admin" ? (
        !isAdmin ? (
          <section className="admin-portal admin-login-fullscreen">
            <div className="admin-login-box">
              <span style={{ fontSize: "44px" }}>🛡️</span>
              <h2>AnnaSetu Regulatory Admin Login</h2>
              <p>
                Restricted System · Enter administrator password to access central regulatory oversight, FSSAI compliance verification, and live moderation.
              </p>

              <form onSubmit={handleAdminLogin} style={{ width: "100%", marginTop: "20px" }}>
                <input
                  type="password"
                  value={adminPasswordInput}
                  onChange={(e) => setAdminPasswordInput(e.target.value)}
                  placeholder="Enter Admin Password"
                  autoFocus
                  required
                  className="admin-login-input"
                />

                {notice && (
                  <p className="form-notice" role="alert" style={{ marginBottom: "16px" }}>
                    {notice}
                  </p>
                )}

                <div className="confirm-actions">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => {
                      if (typeof window !== "undefined") {
                        window.history.pushState({}, "", "/");
                      }
                      setPage("home");
                    }}
                  >
                    ← Return to Home
                  </button>
                  <button
                    type="submit"
                    className="box start-btn primary-submit-btn"
                    style={{
                      "--w": "100%",
                      "--h": "56px",
                      "--tr": "15%",
                      background: "linear-gradient(135deg, #dc2626 0%, #991b1b 100%)",
                      borderColor: "#dc2626",
                    }}
                  >
                    <span className="text">Unlock Admin Portal</span>
                    <CapsuleChevron />
                    <div className="circle-overlay" />
                  </button>
                </div>
              </form>
            </div>
          </section>
        ) : (
          <section className="admin-portal">
          <div className="admin-header">
            <div className="admin-header-left">
              <div className="eyebrow">
                <span className="live-dot" />
                CENTRAL REGULATORY & AUDIT DASHBOARD
                <span className="admin-status-pill">RESTRICTED ACCESS</span>
              </div>
              <h1>
                <span className="admin-brand-text">AnnaSetu</span>{" "}
                <span className="admin-portal-badge">Admin & Compliance Portal</span>
              </h1>
              <p className="admin-subtitle">
                Central oversight across commercial food business operators (FBOs), real-time surplus redistribution, FSSAI verification, and registered relief charities.
              </p>
            </div>

            <div className="admin-header-actions">
              <button
                type="button"
                className="switcher-pill"
                onClick={() => {
                  setFoods(loadFoods());
                  setRegisteredUsersList(getRegisteredUsers());
                  showBanner("Refreshed with live database records.", "info");
                }}
              >
                ↺ Refresh Data
              </button>
              <button
                type="button"
                className="switcher-pill reset-pill"
                onClick={handleAdminLogout}
              >
                🚪 Exit Admin
              </button>
            </div>
          </div>

          {/* Central Oversight KPI Dashboard (BONUS01 Requirement) */}
          <div className="admin-kpi-grid">
            <div className="admin-kpi-card">
              <span className="kpi-icon">🟢</span>
              <div className="kpi-value">{adminMetrics.available}</div>
              <div className="kpi-label">Available Now</div>
              <small className="kpi-sub">Ready for immediate pickup</small>
            </div>

            <div className="admin-kpi-card">
              <span className="kpi-icon">⏳</span>
              <div className="kpi-value">{adminMetrics.pendingPickups}</div>
              <div className="kpi-label">Pending Requests</div>
              <small className="kpi-sub">Awaiting handover approval</small>
            </div>

            <div className="admin-kpi-card">
              <span className="kpi-icon">✅</span>
              <div className="kpi-value">{adminMetrics.collected}</div>
              <div className="kpi-label">Collections Done</div>
              <small className="kpi-sub">Audit trail confirmed via OTP</small>
            </div>

            <div className="admin-kpi-card">
              <span className="kpi-icon">🍱</span>
              <div className="kpi-value">{adminMetrics.totalMeals}</div>
              <div className="kpi-label">Meals Saved</div>
              <small className="kpi-sub">Redistributed to needy</small>
            </div>

            <div className="admin-kpi-card">
              <span className="kpi-icon">⚖️</span>
              <div className="kpi-value">{adminMetrics.totalKg} kg</div>
              <div className="kpi-label">Waste Avoided</div>
              <small className="kpi-sub">Landfill waste diverted</small>
            </div>

            <div className="admin-kpi-card">
              <span className="kpi-icon">🏢</span>
              <div className="kpi-value">
                {adminMetrics.verifiedDonors} / {adminMetrics.totalDonors}
              </div>
              <div className="kpi-label">FSSAI Certified Donors</div>
              <small className="kpi-sub">14-digit license validated</small>
            </div>

            <div className="admin-kpi-card">
              <span className="kpi-icon">💚</span>
              <div className="kpi-value">
                {adminMetrics.verifiedNgos} / {adminMetrics.totalNgos}
              </div>
              <div className="kpi-label">Relief Charities</div>
              <small className="kpi-sub">Verified shelter partners</small>
            </div>

            <div className="admin-kpi-card">
              <span className="kpi-icon">⚠️</span>
              <div className="kpi-value">{adminMetrics.unavailableOrExpired}</div>
              <div className="kpi-label">Flagged / Expired</div>
              <small className="kpi-sub">Locked from redistribution</small>
            </div>

            <div
              className="admin-kpi-card"
              onClick={() => setAdminTab("subscriptions")}
              style={{ cursor: "pointer" }}
            >
              <span className="kpi-icon">💳</span>
              <div className="kpi-value">
                {subscriptionsList.filter((s) => s.status === "Approved").length} / {subscriptionsList.length}
              </div>
              <div className="kpi-label">Verified Subscriptions</div>
              <small className="kpi-sub">
                {subscriptionsList.filter((s) => s.status === "Pending").length} pending verification
              </small>
            </div>
          </div>

          {/* Admin Navigation Tabs */}
          <div className="admin-tabs">
            <button
              type="button"
              className={`admin-tab-btn ${adminTab === "listings" ? "active" : ""}`}
              onClick={() => setAdminTab("listings")}
            >
              📋 All Food Listings Moderation ({foods.length})
            </button>
            <button
              type="button"
              className={`admin-tab-btn ${adminTab === "donors" ? "active" : ""}`}
              onClick={() => setAdminTab("donors")}
            >
              🏢 FSSAI Donors Registry ({registeredUsersList.filter((u) => u.role === "donor").length})
            </button>
            <button
              type="button"
              className={`admin-tab-btn ${adminTab === "ngos" ? "active" : ""}`}
              onClick={() => setAdminTab("ngos")}
            >
              💚 Relief Charities & NGOs ({registeredUsersList.filter((u) => u.role === "ngo").length})
            </button>
            <button
              type="button"
              className={`admin-tab-btn ${adminTab === "audit" ? "active" : ""}`}
              onClick={() => setAdminTab("audit")}
            >
              🔐 Handover OTP Audit Trail ({foods.filter((f) => f.claimedBy).length})
            </button>
            <button
              type="button"
              className={`admin-tab-btn ${adminTab === "requisitions" ? "active" : ""}`}
              onClick={() => setAdminTab("requisitions")}
            >
              🍲 Shelter Requisitions ({requisitions.length})
            </button>
            <button
              type="button"
              className={`admin-tab-btn ${adminTab === "subscriptions" ? "active" : ""}`}
              onClick={() => setAdminTab("subscriptions")}
            >
              💳 Subscriptions &amp; UPI Oversight ({subscriptionsList.filter((s) => s.status === "Pending").length} Pending)
            </button>
          </div>

          {/* Tab 1: All Food Listings Moderation */}
          {adminTab === "listings" && (
            <div className="admin-table-container">
              <div className="admin-table-toolbar">
                <input
                  className="admin-search-input"
                  placeholder="🔍 Search by food, donor, or address..."
                  value={adminSearch}
                  onChange={(e) => setAdminSearch(e.target.value)}
                />
                <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                  <span style={{ fontSize: "12px", color: "#94a3b8" }}>Filter PIN:</span>
                  <select
                    className="admin-search-input"
                    style={{ minWidth: "120px" }}
                    value={adminPincodeFilter}
                    onChange={(e) => setAdminPincodeFilter(e.target.value)}
                  >
                    <option value="All">All PIN Codes</option>
                    <option value="240494">PIN 240494 (Regional)</option>
                    <option value="201310">PIN 201310</option>
                  </select>
                </div>
              </div>

              <div style={{ overflowX: "auto" }}>
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Food Item</th>
                      <th>Donor Establishment</th>
                      <th>PIN & Location</th>
                      <th>Quantity & Weight</th>
                      <th>Safe Storage</th>
                      <th>Status</th>
                      <th>Moderation Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {foods
                      .filter((f) => {
                        const q = adminSearch.toLowerCase();
                        const matchesSearch =
                          !q ||
                          (f.name || "").toLowerCase().includes(q) ||
                          (f.donor || "").toLowerCase().includes(q) ||
                          (f.address || "").toLowerCase().includes(q);
                        const matchesPin =
                          adminPincodeFilter === "All" || f.pincode === adminPincodeFilter;
                        return matchesSearch && matchesPin;
                      })
                      .map((food) => {
                        const expired = isPickupExpired(food.pickup);
                        const isAvail = food.status === "Available" && !expired;
                        return (
                          <tr key={food.id}>
                            <td>
                              <b>{food.name}</b>
                              <br />
                              <small style={{ color: "#94a3b8" }}>{food.category}</small>
                            </td>
                            <td>
                              <b>{food.donor}</b>
                              <br />
                              <small style={{ color: "#94a3b8" }}>{food.donorEmail || "—"}</small>
                            </td>
                            <td>
                              <span className="pincode-pill">PIN: {food.pincode || "240494"}</span>
                              <br />
                              <small style={{ color: "#94a3b8" }}>{food.address}</small>
                            </td>
                            <td>
                              {food.quantity} {food.unit || "meals"}
                              <br />
                              <small style={{ color: "#94a3b8" }}>
                                ~{food.weightKg || Math.round(Number(food.quantity) * 0.4)} kg
                              </small>
                            </td>
                            <td>
                              <span style={{ fontSize: "12px", color: "#38bdf8" }}>
                                {food.storageConditions || "Ambient"}
                              </span>
                              <br />
                              <small style={{ color: "#94a3b8" }}>Prep: {food.prepTime || "Recent"}</small>
                            </td>
                            <td>
                              {isAvail ? (
                                <span className="admin-badge-success">● Available</span>
                              ) : food.status === "Collected" ? (
                                <span className="admin-badge-success">✓ Handed Over</span>
                              ) : food.status === "Requested" ||
                                food.status === "Approved - Pending Handover" ? (
                                <span className="admin-badge-warning">⏳ {food.status}</span>
                              ) : (
                                <span className="admin-badge-danger">
                                  ⚠️ {expired ? "Expired" : "Unavailable"}
                                </span>
                              )}
                            </td>
                            <td>
                              <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                                {isAvail ? (
                                  <button
                                    type="button"
                                    className="admin-btn-flag"
                                    onClick={() => handleAdminFlagListing(food.id)}
                                    title="Flag listing as unsuitable"
                                  >
                                    🚫 Flag Unsuitable
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    className="admin-btn-reinstate"
                                    onClick={() => handleAdminReinstateListing(food.id)}
                                    title="Reinstate listing as Available"
                                  >
                                    🟢 Reinstate
                                  </button>
                                )}
                                <button
                                  type="button"
                                  className="admin-btn-delete"
                                  onClick={() => handleAdminDeleteListing(food.id)}
                                  title="Permanently remove from platform"
                                >
                                  🗑️ Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    {foods.length === 0 && (
                      <tr>
                        <td
                          colSpan="7"
                          style={{ textAlign: "center", padding: "32px", color: "#64748b" }}
                        >
                          No food donations currently registered in the database.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Tab 2: FSSAI Compliance & Donors Registry */}
          {adminTab === "donors" && (
            <div className="admin-table-container">
              <div style={{ overflowX: "auto" }}>
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Establishment Name</th>
                      <th>14-Digit FSSAI License</th>
                      <th>Registered Operator on License</th>
                      <th>Registered Address & PIN</th>
                      <th>Operator Name Match</th>
                      <th>FSSAI Compliance Status</th>
                      <th>Administrative Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {registeredUsersList
                      .filter((u) => u.role === "donor")
                      .map((donor) => (
                        <tr key={donor.id}>
                          <td>
                            <b>{donor.name}</b>
                            <br />
                            <small style={{ color: "#94a3b8" }}>{donor.email}</small>
                          </td>
                          <td>
                            <code
                              style={{
                                background: "rgba(0,0,0,0.4)",
                                padding: "2px 6px",
                                borderRadius: "4px",
                                color: "#38bdf8",
                                fontFamily: "monospace",
                              }}
                            >
                              {donor.fssaiNumber || "10014011001648"}
                            </code>
                          </td>
                          <td>
                            <b>{donor.fssaiName || donor.name}</b>
                          </td>
                          <td>
                            <span className="pincode-pill">PIN: {donor.pincode || "240494"}</span>
                            <br />
                            <small style={{ color: "#94a3b8" }}>{donor.address}</small>
                          </td>
                          <td>
                            <span className="admin-badge-success">
                              ✓ Identical Match (Authenticated)
                            </span>
                          </td>
                          <td>
                            {donor.fssaiVerified ? (
                              <span className="admin-badge-success">✓ Certified FBO</span>
                            ) : (
                              <span className="admin-badge-danger">⚠️ Revoked / Suspended</span>
                            )}
                          </td>
                          <td>
                            <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
                              <button
                                type="button"
                                className={
                                  donor.fssaiVerified ? "admin-btn-flag" : "admin-btn-reinstate"
                                }
                                onClick={() => handleAdminToggleFssai(donor.id)}
                              >
                                {donor.fssaiVerified ? "Revoke FSSAI" : "Grant Compliance"}
                              </button>
                              <button
                                type="button"
                                className="admin-btn-delete"
                                onClick={() => handleAdminDeleteUser(donor.id)}
                                title="Permanently delete donor from registry"
                              >
                                🗑️ Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Tab 3: Relief Charities & NGOs Registry */}
          {adminTab === "ngos" && (
            <div className="admin-table-container">
              <div style={{ overflowX: "auto" }}>
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Relief Organization</th>
                      <th>NGO Registration Number</th>
                      <th>Service Area & PIN</th>
                      <th>Storage Facilities</th>
                      <th>Transport Fleet</th>
                      <th>Relief Status</th>
                      <th>Administrative Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {registeredUsersList
                      .filter((u) => u.role === "ngo")
                      .map((ngo) => (
                        <tr key={ngo.id}>
                          <td>
                            <b>{ngo.name}</b>
                            <br />
                            <small style={{ color: "#94a3b8" }}>{ngo.email}</small>
                          </td>
                          <td>
                            <code
                              style={{
                                background: "rgba(0,0,0,0.4)",
                                padding: "2px 6px",
                                borderRadius: "4px",
                                color: "#4ade80",
                                fontFamily: "monospace",
                              }}
                            >
                              {ngo.registrationNo || "DL/2019/0246221"}
                            </code>
                          </td>
                          <td>
                            <span className="pincode-pill">PIN: {ngo.pincode || "240494"}</span>
                            <br />
                            <small style={{ color: "#94a3b8" }}>{ngo.address}</small>
                          </td>
                          <td>
                            <span style={{ fontSize: "12px", color: "#38bdf8" }}>
                              {(
                                ngo.storageFacilities || [
                                  "Cold Room (4°C)",
                                  "Thermal Boxes",
                                ]
                              ).join(", ")}
                            </span>
                          </td>
                          <td>
                            <span style={{ fontSize: "12px" }}>
                              {ngo.vehicleType || "Insulated Food Rescue Van"}
                            </span>
                          </td>
                          <td>
                            {ngo.verified ? (
                              <span className="admin-badge-success">✓ Active Partner</span>
                            ) : (
                              <span className="admin-badge-danger">⚠️ Suspended</span>
                            )}
                          </td>
                          <td>
                            <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
                              <button
                                type="button"
                                className={ngo.verified ? "admin-btn-flag" : "admin-btn-reinstate"}
                                onClick={() => handleAdminToggleNgoVerified(ngo.id)}
                              >
                                {ngo.verified ? "Suspend" : "Activate"}
                              </button>
                              <button
                                type="button"
                                className="admin-btn-delete"
                                onClick={() => handleAdminDeleteUser(ngo.id)}
                                title="Permanently delete NGO from registry"
                              >
                                🗑️ Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Tab 4: Handover OTP Audit Trail */}
          {adminTab === "audit" && (
            <div className="admin-table-container">
              <div style={{ overflowX: "auto" }}>
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Surplus Food Item</th>
                      <th>Donor Establishment</th>
                      <th>Rescue Partner & Volunteer</th>
                      <th>Handover Status</th>
                      <th>Secure OTP Audit</th>
                      <th>Quality Rating</th>
                      <th>Handover Timestamp</th>
                      <th>Administrative Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {foods
                      .filter((f) => f.claimedBy || f.status === "Collected")
                      .map((food) => (
                        <tr key={food.id}>
                          <td>
                            <b>{food.name}</b>
                            <br />
                            <small style={{ color: "#94a3b8" }}>
                              {food.quantity} {food.unit || "meals"} (~{food.estimatedWeightKg || (food.quantity * 0.4).toFixed(1)} kg)
                            </small>
                          </td>
                          <td>
                            <b>{food.donor}</b>
                            <br />
                            <small style={{ color: "#94a3b8" }}>PIN {food.pincode}</small>
                          </td>
                          <td>
                            <b>{food.claimedBy}</b>
                            {food.requestDetails && (
                              <>
                                <br />
                                <small style={{ color: "#94a3b8" }}>
                                  Vol: {food.requestDetails.volunteerName} (
                                  {food.requestDetails.contactPhone})
                                </small>
                              </>
                            )}
                          </td>
                          <td>
                            {food.status === "Collected" ? (
                              <span className="admin-badge-success">✓ Handover Verified</span>
                            ) : (
                              <span className="admin-badge-warning">⏳ {food.status}</span>
                            )}
                          </td>
                          <td>
                            <code
                              style={{
                                letterSpacing: "2px",
                                fontWeight: "bold",
                                background: "rgba(0,0,0,0.5)",
                                padding: "3px 8px",
                                borderRadius: "6px",
                                color: "#4ade80",
                                fontFamily: "monospace",
                              }}
                            >
                              {food.pickupCode ? `#${food.pickupCode}` : "—"}
                            </code>
                          </td>
                          <td>
                            <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                              {food.donorRating ? (
                                <span style={{ color: "#fbbf24", fontSize: "12px", fontWeight: 600 }}>
                                  <b>Donor:</b> {"⭐".repeat(food.donorRating.stars || 5)} ({food.donorRating.stars}/5)
                                </span>
                              ) : (
                                <small style={{ color: "#64748b", fontSize: "11px" }}>Donor rating: Pending</small>
                              )}
                              {food.ngoRating ? (
                                <span style={{ color: "#4ade80", fontSize: "12px", fontWeight: 600 }}>
                                  <b>NGO:</b> {"⭐".repeat(food.ngoRating.stars || 5)} ({food.ngoRating.stars}/5)
                                </span>
                              ) : (
                                <small style={{ color: "#64748b", fontSize: "11px" }}>NGO rating: Pending</small>
                              )}
                            </div>
                          </td>
                          <td>
                            <small style={{ color: "#cbd5e1" }}>
                              {food.collectedAt || "Pending pickup"}
                            </small>
                          </td>
                          <td>
                            <button
                              type="button"
                              className="admin-btn-delete"
                              onClick={() => handleAdminDeleteAuditTrail(food.id)}
                              title="Delete handover audit record"
                            >
                              🗑️ Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                    {foods.filter((f) => f.claimedBy || f.status === "Collected").length ===
                      0 && (
                      <tr>
                        <td
                          colSpan="8"
                          style={{ textAlign: "center", padding: "32px", color: "#64748b" }}
                        >
                          No handover OTP requests recorded yet. Incoming NGO requests will appear here.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Tab 5: Community Shelter Requisitions Moderation */}
          {adminTab === "requisitions" && (
            <div className="admin-table-container">
              <div className="admin-table-toolbar">
                <input
                  className="admin-search-input"
                  placeholder="🔍 Search shelter requisitions by NGO, title, or PIN..."
                  value={adminSearch}
                  onChange={(e) => setAdminSearch(e.target.value)}
                />
              </div>
              <div className="table-responsive">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Status</th>
                      <th>NGO & Contact</th>
                      <th>Requisition Details</th>
                      <th>Meals Needed</th>
                      <th>Urgency</th>
                      <th>Pledged By</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {requisitions
                      .filter((req) => {
                        const q = adminSearch.toLowerCase();
                        return (
                          req.title.toLowerCase().includes(q) ||
                          req.ngoName.toLowerCase().includes(q) ||
                          req.pincode.includes(q)
                        );
                      })
                      .map((req) => (
                        <tr key={req.id}>
                          <td>
                            <span
                              className={
                                req.status === "Fulfilled"
                                  ? "admin-badge-success"
                                  : req.status === "Pledged"
                                  ? "admin-badge-info"
                                  : "admin-badge-warning"
                              }
                            >
                              {req.status}
                            </span>
                          </td>
                          <td>
                            <b>{req.ngoName}</b>
                            <br />
                            <small style={{ color: "#94a3b8" }}>
                              {req.contactPerson} ({req.contactPhone})
                            </small>
                          </td>
                          <td>
                            <b>{req.title}</b>
                            <br />
                            <small style={{ color: "#94a3b8" }}>
                              {req.beneficiaryType} · PIN {req.pincode}
                            </small>
                          </td>
                          <td>
                            <strong>{req.mealsNeeded} meals</strong>
                          </td>
                          <td>
                            <span className="urgency-tag">{req.urgency}</span>
                          </td>
                          <td>
                            {req.pledgedBy ? (
                              <>
                                <b>{req.pledgedBy}</b>
                                <br />
                                <small style={{ color: "#4ade80" }}>
                                  {req.pledgedMeals} meals ({req.pledgedReadyTime})
                                </small>
                              </>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td>
                            <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
                              {req.status === "Pledged" && (
                                <button
                                  type="button"
                                  className="admin-btn-reinstate"
                                  onClick={() => confirmRequisitionFulfilled(req.id)}
                                >
                                  ✓ Mark Fulfilled
                                </button>
                              )}
                              <button
                                type="button"
                                className="admin-btn-delete"
                                onClick={() => handleAdminDeleteRequisition(req.id)}
                                title="Permanently delete requisition"
                              >
                                🗑️ Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    {requisitions.length === 0 && (
                      <tr>
                        <td
                          colSpan="7"
                          style={{ textAlign: "center", padding: "32px", color: "#64748b" }}
                        >
                          No community shelter requisitions posted yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Tab 6: Subscriptions & UPI Oversight */}
          {adminTab === "subscriptions" && (
            <AdminSubscriptionsPanel
              adminUpiId={adminUpiId}
              onUpdateAdminUpi={(newUpi) => {
                setAdminUpiId(newUpi);
                saveAdminUpiId(newUpi);
              }}
              subscriptions={subscriptionsList}
              onApprove={(id) => handleApproveSubscription(id)}
              onReject={(id) => handleRejectSubscription(id)}
              showBanner={showBanner}
            />
          )}

          <p className="demo-note" style={{ marginTop: "24px" }}>
            AnnaSetu Regulatory Admin Engine · FSSAI Compliance Verification · Password Protected Session.
          </p>
        </section>
        )
      ) : (
        <section className="dashboard">
          {/* Optional Developer Sandbox Toggle */}
          <div className="dev-sandbox-toggle">
            <button
              type="button"
              className="dev-toggle-btn"
              onClick={() => setShowDevSandbox(!showDevSandbox)}
            >
              {showDevSandbox ? "Hide Developer Sandbox" : "🛠️ Developer Sandbox (Demo Personas & Reset)"}
            </button>
          </div>

          {showDevSandbox && (
            <div className="demo-switcher-bar">
              <div>
                <strong>🛠️ Developer Testing Tools:</strong>
                <span>Switch between demo accounts or reset data across browser tabs.</span>
              </div>
              <div className="demo-switcher-actions">
                <button
                  type="button"
                  className={`switcher-pill ${role === "donor" ? "active" : ""}`}
                  onClick={() => autoFillDemo("donor")}
                >
                  🍔 McDonald's (Donor)
                </button>
                <button
                  type="button"
                  className={`switcher-pill ${role === "ngo" ? "active" : ""}`}
                  onClick={() => autoFillDemo("ngo")}
                >
                  💚 Feeding India (NGO)
                </button>
                <button
                  type="button"
                  className="switcher-pill"
                  onClick={() => triggerEmailToast("reminder")}
                  title="Simulate 1-day reminder email"
                >
                  📧 1-Day Reminder Email
                </button>
                <button
                  type="button"
                  className="switcher-pill"
                  onClick={() => triggerEmailToast("banned")}
                  title="Simulate account suspended email"
                >
                  📧 Banned Email
                </button>
                <button
                  type="button"
                  className={`switcher-pill ${isPaymentDue ? "active" : ""}`}
                  onClick={() => {
                    const next = !isPaymentDue;
                    setIsPaymentDue(next);
                    setPaymentDueDismissed(false);
                    showBanner(next ? "Payment Due state simulated! Popup will appear on load." : "Payment Due state cleared.", "info");
                  }}
                  title="Toggle simulated payment due on dashboard load"
                >
                  ⚠️ {isPaymentDue ? "Payment Due (Active)" : "Simulate Payment Due"}
                </button>
                <button
                  type="button"
                  className={`switcher-pill ${isOverdueBanned ? "active reset-pill" : ""}`}
                  onClick={() => handleToggleBan(!isOverdueBanned)}
                  title="Toggle 5-day overdue account ban"
                >
                  ⛔ {isOverdueBanned ? "Unban Account" : "Simulate 5-Day Ban"}
                </button>
                <button
                  type="button"
                  className="switcher-pill"
                  onClick={() => setShowCheckoutModal(true)}
                  title="Open QR Payment Checkout"
                >
                  💳 Open QR Payment
                </button>
                <button
                  type="button"
                  className="switcher-pill reset-pill"
                  onClick={resetDemoData}
                >
                  ↺ Reset Listings
                </button>
              </div>
            </div>
          )}

          <div className="dashboard-top">
            <div>
              <div className="eyebrow">
                <span className="live-dot" />
                {role === "donor" ? "DONOR WORKSPACE" : "NGO RESCUE WORKSPACE"}
                <span className="pincode-pill">PIN: {pincode}</span>
                {currentUser?.fssaiNumber && (
                  <span
                    className="pincode-pill"
                    style={{
                      background: "rgba(34, 197, 94, 0.15)",
                      color: "#4ade80",
                      borderColor: "rgba(34, 197, 94, 0.35)",
                    }}
                  >
                    ✓ FSSAI Certified FBO: #{currentUser.fssaiNumber}
                  </span>
                )}
              </div>
              <h1>
                Welcome, <span>{name}</span>!
              </h1>
              <p className="description">
                {role === "donor"
                  ? "Publish surplus meals, coordinate with verified local NGOs, and verify handovers."
                  : "Browse verified surplus donations in your PIN code, dispatch volunteers, and track rescue pickups."}
              </p>
            </div>

            {/* Clean Single Action Bar - With Profile & Multi-Branch Access */}
            <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
              <button
                type="button"
                className="secondary-button"
                onClick={() => openAccountModal("profile")}
                title="Edit Organization Profile and Manage Multiple Properties / Branches"
              >
                ⚙️ Account Details &amp; Branches
              </button>
              <button
                className="secondary-button"
                onClick={handleCleanData}
                title="Clears old test data and restores clean state"
              >
                🧹 Clean Stale Data
              </button>
            </div>
          </div>

          {notice && (
            <div className={`notice notice-${noticeType}`} role="status">
              <span>{notice}</span>
              <button onClick={() => setNotice("")} aria-label="Dismiss notice">
                ×
              </button>
            </div>
          )}

          {/* Central Impact Dashboard */}
          <div className="stats-grid stats-grid-5">
            <article className="stat-card">
              <span>🟢</span>
              <small>Available Now</small>
              <strong>{impact.activeDonations}</strong>
            </article>
            <article className="stat-card">
              <span>⏳</span>
              <small>Pending Requests</small>
              <strong>{impact.pendingRequests}</strong>
            </article>
            <article className="stat-card">
              <span>✅</span>
              <small>Collections Done</small>
              <strong>{impact.completedCollections}</strong>
            </article>
            <article className="stat-card">
              <span>🍱</span>
              <small>Meals Saved</small>
              <strong>{impact.mealsRedistributed}</strong>
            </article>
            <article className="stat-card">
              <span>⚖️</span>
              <small>Waste Avoided</small>
              <strong>{impact.wasteAvoidedKg} kg</strong>
            </article>
          </div>

          {/* Quality Gamification & FSSAI Audit Card (Donor Only) */}
          {role === "donor" && (
            <QualityGamificationCard
              rating={donorRating}
              onRatingChange={handleDonorRatingChange}
              donorName={name || currentUser?.name || "McDonald's"}
              showControls={true}
            />
          )}

          {/* Workspace Tabs: Listings vs Requisitions */}
          <div className="workspace-tabs">
            <button
              type="button"
              className={`workspace-tab-btn ${dashboardTab === "listings" ? "active" : ""}`}
              onClick={() => setDashboardTab("listings")}
            >
              🍱 {role === "donor" ? "My Surplus Donations" : "Surplus Food Rescue Feed"}
              <span className="tab-badge">
                {role === "donor" ? visibleFoods.length : foods.length}
              </span>
            </button>
            <button
              type="button"
              className={`workspace-tab-btn ${dashboardTab === "requisitions" ? "active" : ""}`}
              onClick={() => setDashboardTab("requisitions")}
            >
              🍲 {role === "donor" ? "Community Shelter Requisitions (Pledge Food)" : "Ask for Food / Shelter Requisitions"}
              <span className="tab-badge">
                {requisitions.filter((r) => r.status === "Open" || (role === "ngo" && r.ngoName.toLowerCase() === name.trim().toLowerCase())).length}
              </span>
            </button>
            <button
              type="button"
              className={`workspace-tab-btn ${dashboardTab === "plans" ? "active" : ""}`}
              onClick={() => setDashboardTab("plans")}
            >
              💎 Membership &amp; Plans
              <span className="tab-badge" style={{ textTransform: "capitalize" }}>
                {userSubStatus === "active"
                  ? "✓ Active"
                  : userSubStatus === "pending"
                  ? "⏳ Pending"
                  : userSubStatus === "rejected"
                  ? "✗ Rejected"
                  : userSubStatus === "due"
                  ? "⚠️ Due"
                  : isOverdueBanned
                  ? "⛔ Banned"
                  : "Trial"}
              </span>
            </button>
          </div>

          {dashboardTab === "listings" && (
            <div className="dashboard-panel">
            <div className="panel-heading">
              <div>
                <h2>
                  {role === "donor"
                    ? "Manage Food Donations & NGO Requests"
                    : "Live Surplus Rescue Feed (PIN Code Matching)"}
                </h2>
                <p>
                  {role === "donor"
                    ? "Publishing surplus food triggers automated PIN code alert emails to registered local NGOs."
                    : "Donations in your PIN code are prioritized. Dual confirmation emails sent on every status change."}
                </p>
              </div>

              {role === "donor" && (
                <button
                  className="primary-button compact"
                  onClick={() => {
                    if (!showForm && !pickup) {
                      const d = new Date(Date.now() + 3 * 3600000);
                      const pad = (n) => String(n).padStart(2, "0");
                      const localIso = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
                      setPickup(localIso);
                    }
                    setShowForm(!showForm);
                    setNotice("");
                  }}
                >
                  {showForm ? "Cancel" : "+ Add food"}
                </button>
              )}
            </div>

            {/* Donor Add Food Form - Clean & Deterministic with ALL Options */}
            {showForm && role === "donor" && (
              <form className="food-form" onSubmit={addFood}>
                <h3>Publish a Surplus Food Donation</h3>

                {/* Dispatching Property / Branch Selector */}
                {(() => {
                  const branches = getUserBranches(currentUser);
                  return (
                    <div style={{ marginBottom: "14px", background: "rgba(34, 197, 94, 0.06)", border: "1px solid rgba(34, 197, 94, 0.25)", borderRadius: "10px", padding: "12px 14px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                        <span style={{ fontSize: "12.5px", fontWeight: 700, color: "#86efac" }}>
                          🏢 Dispatching Branch / Property:
                        </span>
                        <button
                          type="button"
                          className="text-button"
                          style={{ fontSize: "11.5px", padding: 0 }}
                          onClick={() => openAccountModal("branches")}
                        >
                          + Manage Properties ({branches.length})
                        </button>
                      </div>
                      <select
                        className="branch-property-select"
                        value={selectedBranchId || branches.find((b) => b.isPrimary)?.id || branches[0]?.id}
                        onChange={(e) => {
                          const id = e.target.value;
                          setSelectedBranchId(id);
                          const chosen = branches.find((b) => b.id === id);
                          if (chosen) {
                            setListingAddress(chosen.address);
                            setListingPincode(chosen.pincode);
                            if (chosen.accessNotes) setDockInstructions(chosen.accessNotes);
                            showBanner(`Pickup location set to: ${chosen.name} (PIN ${chosen.pincode})`, "info");
                          }
                        }}
                        style={{ width: "100%", backgroundColor: "#ffffff", color: "#111827", border: "1px solid #d1d5db" }}
                      >
                        {branches.map((b) => (
                          <option key={b.id} value={b.id} style={{ backgroundColor: "#ffffff", color: "#111827" }}>
                            {b.name} — PIN {b.pincode} ({b.address})
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })()}

                <label>
                  Food Item Name
                  <input
                    value={foodName}
                    onChange={(e) => setFoodName(e.target.value)}
                    placeholder="e.g. Fresh Veg Biryani & Paneer Curry"
                    required
                  />
                </label>

                <div className="form-grid">
                  <label>
                    Category
                    <select
                      value={category}
                      onChange={(e) => {
                        const newCat = e.target.value;
                        setCategory(newCat);
                        if (newCat === "Vegetarian" || newCat === "Fruits") {
                          setDietary((prev) => prev.filter((t) => t !== "Halal Certified"));
                        } else if (newCat === "Non-vegetarian") {
                          setDietary((prev) => prev.filter((t) => t !== "Pure Veg" && t !== "Jain"));
                        }
                      }}
                    >
                      <option>Vegetarian</option>
                      <option>Non-vegetarian</option>
                      <option>Bakery</option>
                      <option>Fruits</option>
                      <option>Cooked Meals</option>
                    </select>
                  </label>

                  <label>
                    Quantity
                    <input
                      type="number"
                      min="1"
                      max="10000"
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                      required
                    />
                  </label>

                  <label>
                    Unit
                    <select
                      value={unit}
                      onChange={(e) => setUnit(e.target.value)}
                    >
                      <option value="meals">Meals</option>
                      <option value="boxes">Boxes</option>
                      <option value="kg">Kilograms</option>
                    </select>
                  </label>

                  <label>
                    Collection Deadline
                    <input
                      type="datetime-local"
                      value={pickup}
                      onChange={(e) => setPickup(e.target.value)}
                      required
                    />
                  </label>
                </div>

                <div className="form-grid">
                  <label>
                    Pickup PIN Code (Auto-Alerts Local NGOs)
                    <input
                      value={listingPincode}
                      onChange={(e) =>
                        setListingPincode(e.target.value.replace(/\D/g, "").slice(0, 6))
                      }
                      placeholder="6-digit PIN"
                      maxLength={6}
                      required
                    />
                  </label>

                  <label>
                    Storage Conditions
                    <select
                      value={storageConditions}
                      onChange={(e) => setStorageConditions(e.target.value)}
                    >
                      <option>Heated / Insulated (&gt;60°C)</option>
                      <option>Ambient (Room Temp)</option>
                      <option>Refrigerated (Cold 4°C)</option>
                      <option>Deep Frozen (-18°C)</option>
                    </select>
                  </label>
                </div>

                <div className="form-grid">
                  <label>
                    Packaging Type
                    <select
                      value={packaging}
                      onChange={(e) => setPackaging(e.target.value)}
                    >
                      <option>Sealed Food Containers</option>
                      <option>Insulated Hot-Packs</option>
                      <option>Aluminum Foil Catering Trays</option>
                      <option>Individual Clamshell Meal Boxes</option>
                      <option>Bulk Stainless Steel Cans / Vessels</option>
                      <option>Clean Covered Biodegradable Boxes</option>
                    </select>
                  </label>

                  <label>
                    Surplus Schedule Frequency
                    <select
                      value={donationFrequency}
                      onChange={(e) => setDonationFrequency(e.target.value)}
                    >
                      <option>One-Time Surplus Event</option>
                      <option>Daily Mess Surplus (Lunch &amp; Dinner)</option>
                      <option>Weekend Buffet Surplus</option>
                      <option>Recurring Daily Kitchen Surplus</option>
                    </select>
                  </label>
                </div>

                <div className="form-grid">
                  <label>
                    Target Beneficiary Preference
                    <select
                      value={targetNgo}
                      onChange={(e) => setTargetNgo(e.target.value)}
                    >
                      <option value="All">All Verified Local NGOs (PIN Matched)</option>
                      <option value="Shelters">Night Shelters &amp; Homeless Relief Only</option>
                      <option value="Children">Orphanages &amp; Child Relief Only</option>
                      <option value="Seniors">Senior Citizen Homes Only</option>
                    </select>
                  </label>

                  <label>
                    Loading Dock / Kitchen Access Note
                    <input
                      value={dockInstructions}
                      onChange={(e) => setDockInstructions(e.target.value)}
                      placeholder="e.g. Use Rear Gate 2 service elevator, report to Chef"
                    />
                  </label>
                </div>

                <div className="form-grid">
                  <label>
                    Preparation Time
                    <select
                      value={prepTime}
                      onChange={(e) => setPrepTime(e.target.value)}
                    >
                      <option>Cooked &lt; 1 hour ago</option>
                      <option>Cooked 1.5 - 2 hours ago</option>
                      <option>Cooked 3 - 4 hours ago</option>
                      <option>Freshly cut / packed</option>
                    </select>
                  </label>

                  <label>
                    Food Handling Instructions
                    <input
                      value={handlingInstructions}
                      onChange={(e) => setHandlingInstructions(e.target.value)}
                      placeholder="e.g. Keep insulated until delivery"
                    />
                  </label>
                </div>

                <label>
                  Dietary Suitability &amp; Certification
                  <div className="dietary-pill-selector">
                    {["Pure Veg", "Jain", "Halal Certified", "Gluten-Free", "Eggless", "Nut-Free"].map((tag) => {
                      const active = dietary.includes(tag);
                      const restriction = !active ? getDietaryRestriction(tag) : null;
                      const isDisabled = Boolean(restriction);
                      return (
                        <button
                          key={tag}
                          type="button"
                          disabled={isDisabled}
                          className={`dietary-pill ${active ? "selected" : ""} ${isDisabled ? "disabled" : ""}`}
                          title={restriction || `${active ? "Remove" : "Add"} ${tag}`}
                          onClick={() => handleDietaryToggle(tag)}
                        >
                          {active ? "✓ " : "+ "}{tag}
                        </button>
                      );
                    })}
                  </div>
                  <div className="dietary-helper-note">
                    <span>💡</span>
                    <span>
                      <strong>Dietary Rules:</strong> &ldquo;Pure Veg&rdquo; &amp; &ldquo;Jain&rdquo; are mutually exclusive with &ldquo;Halal Certified&rdquo;.
                    </span>
                  </div>
                </label>

                <label>
                  Pickup Street Address
                  <input
                    value={listingAddress}
                    onChange={(e) => setListingAddress(e.target.value)}
                    placeholder="e.g. Sector Alpha 1 Commercial Complex"
                    required
                  />
                </label>

                <button
                  className="box start-btn primary-submit-btn"
                  type="submit"
                  style={{ "--w": "100%", "--h": "58px", "--tr": "15%" }}
                >
                  <span className="text">Publish Surplus Donation & Alert PIN {listingPincode} NGOs</span>
                  <CapsuleChevron />
                  <div className="circle-overlay" />
                </button>
              </form>
            )}

            <div className="filter-bar">
              <div className="filter-row">
                <label htmlFor="food-filter">Filter status</label>
                <select
                  id="food-filter"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                >
                  <option value="All">All listings</option>
                  <option value="Available">Available</option>
                  {role === "ngo" && <option value="My Requests">My NGO Requests</option>}
                  <option value="Requested">Requested (Pending)</option>
                  <option value="Accepted">Accepted (In Pickup)</option>
                  <option value="Collected">Collected (Completed)</option>
                  <option value="Unavailable">Unavailable / Expired</option>
                </select>
              </div>

              <label className="checkbox-toggle">
                <input
                  type="checkbox"
                  checked={hideUnavailable}
                  onChange={(e) => setHideUnavailable(e.target.checked)}
                />
                <span>Hide unavailable & collected listings</span>
              </label>
            </div>

            <div className="food-list">
              {visibleFoods.map((food) => {
                const expired = isPickupExpired(food.pickup);
                const remainingMins = getRemainingMinutes(food.pickup);
                const isUrgent =
                  remainingMins > 0 && remainingMins <= 90 && food.status === "Available";

                const effectiveStatus =
                  expired && food.status === "Available" ? "Unavailable" : food.status;

                const isMyDonorListing =
                  role === "donor" &&
                  checkDonorOwnership(food, currentUser || { email, name, role });

                const isMyNgoRequest =
                  role === "ngo" &&
                  food.claimedBy.toLowerCase() === name.trim().toLowerCase();

                const isLockedByOtherNgo =
                  role === "ngo" &&
                  food.claimedBy &&
                  !isMyNgoRequest &&
                  effectiveStatus !== "Available";

                const isSamePincode =
                  String(food.pincode).trim() === String(pincode).trim();

                return (
                  <article
                    className={`food-card ${
                      effectiveStatus === "Unavailable" ? "card-unavailable" : ""
                    }`}
                    key={food.id}
                  >
                    <div className="food-card-icon">
                      {food.category === "Fruits"
                        ? "🍎"
                        : food.category === "Bakery"
                        ? "🥐"
                        : "🍱"}
                    </div>

                    <div className="food-info">
                      <div className="food-title-row">
                        <h3>{food.name}</h3>
                        <span className={`status status-${effectiveStatus.toLowerCase()}`}>
                          {effectiveStatus}
                        </span>

                        {isSamePincode && (
                          <span className="pincode-pill">
                            📍 Local PIN ({food.pincode})
                          </span>
                        )}

                        {food.pickupStage === "ReadyForPickup" &&
                          effectiveStatus === "Accepted" && (
                            <span className="stage-badge">📦 Packed & Ready</span>
                          )}

                        {food.pickupStage === "VolunteerEnRoute" &&
                          effectiveStatus === "Accepted" && (
                            <span className="stage-badge stage-transit">🚚 Volunteer En Route</span>
                          )}

                        {isMyNgoRequest && (
                          <span className="my-request-tag">✓ Your NGO Request</span>
                        )}
                      </div>

                      {/* Clean Metadata Badges */}
                      <div className="badge-group">
                        {isUrgent && (
                          <span className="urgent-badge">
                            🚨 Urgent ({remainingMins}m left)
                          </span>
                        )}

                        <span className="meta-pill">🌡️ {food.storageConditions}</span>
                        <span className="meta-pill">🕒 {food.prepTime}</span>
                      </div>

                      <p>
                        <strong>
                          {food.quantity} {food.unit}
                        </strong>{" "}
                        (~{food.estimatedWeightKg || (food.quantity * 0.4).toFixed(1)} kg) · {food.category}
                      </p>
                      <p>📍 {food.address} (PIN: <strong>{food.pincode}</strong>)</p>
                      <p>
                        🕒 Pickup deadline: {formatPickupTime(food.pickup)}
                        {expired && <span className="expired-tag"> (Window Expired)</span>}
                      </p>


                      <small>
                        Donor Kitchen: <b>{food.donor}</b>
                        {food.claimedBy ? ` · Rescue Partner: ${food.claimedBy}` : ""}
                      </small>

                      {/* Intelligent Matching Recommendation for Donor (BONUS01) */}
                      {isMyDonorListing &&
                        effectiveStatus === "Available" &&
                        topMatches[food.id] && (
                          <div className="matched-ngo-callout">
                            <span className="match-pill">
                              🎯 Top Rescue Match: <b>{topMatches[food.id].name}</b> ({topMatches[food.id].matchScore}% suitability · {topMatches[food.id].distanceKm} km)
                            </span>
                            <small style={{ color: "#94a3b8", display: "block", marginTop: "4px" }}>
                              {topMatches[food.id].reasons?.join(" · ")}
                            </small>
                          </div>
                        )}

                      {/* Request Details Metadata Box (Privacy Protected: Only Donor & Requesting NGO) */}
                      {food.requestDetails &&
                        effectiveStatus !== "Available" &&
                        (isMyDonorListing || isMyNgoRequest) && (
                        <div className="request-meta-box">
                          <div className="request-meta-grid">
                            <span>
                              <b>NGO:</b> {food.requestDetails.ngoName}
                            </span>
                            <span>
                              <b>Volunteer:</b> {food.requestDetails.volunteerName} ({food.requestDetails.contactPhone})
                            </span>
                            <span>
                              <b>ETA:</b> {food.requestDetails.eta}
                            </span>
                            {/* Strict OTP Privacy: ONLY the claiming NGO volunteer can see the secret Handover OTP digits */}
                            {role === "ngo" && isMyNgoRequest && food.pickupCode && (
                              <span className="otp-badge">
                                🔐 Handover OTP: <b>#{food.pickupCode}</b>
                              </span>
                            )}
                            {/* The Donor must NEVER see the OTP digits before physical collection */}
                            {role === "donor" && effectiveStatus === "Accepted" && (
                              <span
                                className="otp-badge donor-otp-prompt"
                                style={{
                                  background: "rgba(100, 116, 139, 0.12)",
                                  borderColor: "rgba(100, 116, 139, 0.25)",
                                  color: "#94a3b8",
                                }}
                              >
                                🔐 Handover Verification: <small style={{ fontWeight: 500, color: "#cbd5e1" }}>Ask NGO volunteer for 4-digit code upon arrival</small>
                              </span>
                            )}
                          </div>
                          {food.requestDetails.note && (
                            <p className="request-note">
                              💬 &ldquo;{food.requestDetails.note}&rdquo;
                            </p>
                          )}
                        </div>
                      )}

                      {/* 4-Step Pickup Progress Tracker */}
                      {(effectiveStatus === "Requested" ||
                        effectiveStatus === "Accepted" ||
                        effectiveStatus === "Collected") && (
                        <div className="pickup-stepper">
                          <div className="step completed">
                            <span className="step-dot">1</span>
                            <small>Requested</small>
                          </div>
                          <div
                            className={`step ${
                              effectiveStatus === "Accepted" || effectiveStatus === "Collected"
                                ? "completed"
                                : ""
                            }`}
                          >
                            <span className="step-dot">2</span>
                            <small>Donor Accepted</small>
                          </div>
                          <div
                            className={`step ${
                              food.pickupStage === "ReadyForPickup" ||
                              food.pickupStage === "VolunteerEnRoute" ||
                              effectiveStatus === "Collected"
                                ? "completed"
                                : ""
                            }`}
                          >
                            <span className="step-dot">3</span>
                            <small>En Route</small>
                          </div>
                          <div className={`step ${effectiveStatus === "Collected" ? "completed" : ""}`}>
                            <span className="step-dot">4</span>
                            <small>Delivered{food.collectionConfirmedByNgo ? " ✓" : ""}</small>
                          </div>
                        </div>
                      )}

                      {effectiveStatus === "Collected" && (
                        <div className="collection-summary">
                          ✅ Verified Handover completed
                          {food.collectedAt ? ` at ${food.collectedAt}` : ""}. Audit trail confirmed via Gmail OTP.
                        </div>
                      )}

                      {/* Decoupled Dual Rating System: donorRating & ngoRating */}
                      {effectiveStatus === "Collected" && (
                        <div className="handover-rating-box">
                          {/* Active User's Rating Action / Status */}
                          {role === "donor" && (
                            <div className="rating-row">
                              <span className="rating-label">
                                ⭐ Your Rating for Rescue Partner ({food.claimedBy || "NGO"}):
                              </span>
                              {food.ngoRating ? (
                                <span className="rating-stars-badge">
                                  {"⭐".repeat(food.ngoRating.stars || 5)} ({food.ngoRating.stars || 5}/5)
                                  <small style={{ color: "#cbd5e1" }}> · Submitted at {food.ngoRating.ratedAt}</small>
                                </span>
                              ) : (
                                <div className="star-rating-buttons">
                                  {[1, 2, 3, 4, 5].map((star) => (
                                    <button
                                      key={star}
                                      type="button"
                                      className="star-btn"
                                      onClick={() => handleRateCollection(food.id, star, "ngoRating")}
                                      title={`Rate Rescue Partner ${star} Star${star > 1 ? "s" : ""}`}
                                    >
                                      ⭐
                                    </button>
                                  ))}
                                  <small style={{ color: "#94a3b8", marginLeft: "6px" }}>
                                    Rate rescue speed &amp; volunteer handling
                                  </small>
                                </div>
                              )}
                            </div>
                          )}

                          {role === "ngo" && (
                            <div className="rating-row">
                              <span className="rating-label">
                                ⭐ Your Rating for Food Donor ({food.donor}):
                              </span>
                              {food.donorRating ? (
                                <span className="rating-stars-badge">
                                  {"⭐".repeat(food.donorRating.stars || 5)} ({food.donorRating.stars || 5}/5)
                                  <small style={{ color: "#cbd5e1" }}> · Submitted at {food.donorRating.ratedAt}</small>
                                </span>
                              ) : (
                                <div className="star-rating-buttons">
                                  {[1, 2, 3, 4, 5].map((star) => (
                                    <button
                                      key={star}
                                      type="button"
                                      className="star-btn"
                                      onClick={() => handleRateCollection(food.id, star, "donorRating")}
                                      title={`Rate Food Donor ${star} Star${star > 1 ? "s" : ""}`}
                                    >
                                      ⭐
                                    </button>
                                  ))}
                                  <small style={{ color: "#94a3b8", marginLeft: "6px" }}>
                                    Rate food freshness &amp; packaging
                                  </small>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Counter-Party Feedback Status */}
                          {role === "donor" && (
                            <div className="rating-row rating-row-pending">
                              <span style={{ fontSize: "12px", color: "#86efac", fontWeight: 600 }}>
                                💚 Rating from NGO Partner:
                              </span>
                              {food.donorRating ? (
                                <span className="rating-stars-badge" style={{ color: "#86efac" }}>
                                  {"⭐".repeat(food.donorRating.stars || 5)} ({food.donorRating.stars || 5}/5)
                                  <small style={{ color: "#cbd5e1" }}> · Verified by {food.donorRating.ratedBy}</small>
                                </span>
                              ) : (
                                <small style={{ color: "#64748b" }}>Pending rating from NGO partner</small>
                              )}
                            </div>
                          )}

                          {role === "ngo" && (
                            <div className="rating-row rating-row-pending">
                              <span style={{ fontSize: "12px", color: "#fdba74", fontWeight: 600 }}>
                                🍲 Rating from Food Donor:
                              </span>
                              {food.ngoRating ? (
                                <span className="rating-stars-badge" style={{ color: "#fdba74" }}>
                                  {"⭐".repeat(food.ngoRating.stars || 5)} ({food.ngoRating.stars || 5}/5)
                                  <small style={{ color: "#cbd5e1" }}> · Verified by {food.ngoRating.ratedBy}</small>
                                </span>
                              ) : (
                                <small style={{ color: "#64748b" }}>Pending rating from food donor</small>
                              )}
                            </div>
                          )}

                          {role !== "donor" && role !== "ngo" && (
                            <div className="rating-row">
                              <span className="rating-label">⭐ Handover Ratings:</span>
                              <span style={{ fontSize: "12px", color: "#fde68a" }}>
                                Donor: {food.donorRating ? `${food.donorRating.stars}/5` : "Pending"} | NGO: {food.ngoRating ? `${food.ngoRating.stars}/5` : "Pending"}
                              </span>
                            </div>
                          )}
                        </div>
                      )}

                      {effectiveStatus === "Unavailable" && (
                        <div className="unavailable-banner">
                          ⚠️ Unavailable:{" "}
                          {expired
                            ? "Pickup window expired. Safety lock engaged."
                            : food.unavailableReason || "Listing paused."}
                        </div>
                      )}
                    </div>

                    {/* Action Buttons Column */}
                    <div className="food-actions">
                      {role === "ngo" && effectiveStatus === "Available" && (
                        <button
                          className="primary-button compact"
                          onClick={() => openRequestModal(food.id)}
                        >
                          Request food
                        </button>
                      )}

                      {role === "ngo" &&
                        isMyNgoRequest &&
                        effectiveStatus === "Requested" && (
                          <>
                            <button className="secondary-button compact disabled-pill" disabled>
                              ⏳ Awaiting Donor
                            </button>
                            <button
                              className="secondary-button compact remove-button"
                              onClick={() => withdrawRequest(food.id)}
                            >
                              Withdraw
                            </button>
                          </>
                        )}

                      {role === "ngo" &&
                        isMyNgoRequest &&
                        effectiveStatus === "Accepted" && (
                          <>
                            {food.pickupStage !== "VolunteerEnRoute" && (
                              <button
                                className="secondary-button compact"
                                onClick={() => updatePickupStage(food.id, "VolunteerEnRoute")}
                              >
                                🚚 Volunteer En Route
                              </button>
                            )}
                            <button
                              className="primary-button compact"
                              onClick={() => confirmNgoReceipt(food.id)}
                            >
                              ✓ Confirm Received
                            </button>
                          </>
                        )}

                      {role === "ngo" &&
                        isMyNgoRequest &&
                        effectiveStatus === "Collected" &&
                        !food.collectionConfirmedByNgo && (
                          <button
                            className="primary-button compact"
                            onClick={() => confirmNgoReceipt(food.id)}
                          >
                            ✓ Confirm Delivery
                          </button>
                        )}

                      {role === "ngo" && isLockedByOtherNgo && (
                        <button className="secondary-button compact disabled-pill" disabled>
                          🔒 Claimed ({effectiveStatus})
                        </button>
                      )}

                      {/* Donor Actions - Strictly restricted to verified listing owner */}
                      {isMyDonorListing && (
                        <>
                          {effectiveStatus === "Requested" && (
                            <>
                              <button
                                className="primary-button compact"
                                onClick={() => acceptRequest(food.id)}
                              >
                                ✓ Accept Request
                              </button>
                              <button
                                className="secondary-button compact remove-button"
                                onClick={() => {
                                  setRejectingFoodId(food.id);
                                  setRejectReason("Pickup timing does not match kitchen hours");
                                }}
                              >
                                ✕ Decline
                              </button>
                            </>
                          )}

                          {effectiveStatus === "Accepted" && (
                            <>
                              {food.pickupStage === "Approved" && (
                                <button
                                  className="secondary-button compact"
                                  onClick={() => updatePickupStage(food.id, "ReadyForPickup")}
                                >
                                  📦 Mark Ready
                                </button>
                              )}
                              <button
                                className="primary-button compact"
                                onClick={() => {
                                  setVerifyingCollectionId(food.id);
                                  setEnteredOtp("");
                                }}
                              >
                                ✓ Verify Handover
                              </button>
                            </>
                          )}

                          {(effectiveStatus === "Available" || effectiveStatus === "Unavailable") &&
                            !expired && (
                              <button
                                className="secondary-button compact"
                                onClick={() => toggleAvailability(food.id)}
                              >
                                {effectiveStatus === "Available" ? "Pause Listing" : "Re-open"}
                              </button>
                            )}

                          <button
                            className="secondary-button compact remove-button"
                            onClick={() => setConfirmRemove(food.id)}
                          >
                            Remove
                          </button>
                        </>
                      )}
                    </div>
                  </article>
                );
              })}

              {visibleFoods.length === 0 && (
                <div className="empty-state">
                  <span>🥬</span>
                  <h3>
                    {role === "donor"
                      ? "No surplus donations listed yet"
                      : `No active donations in PIN code ${pincode} yet`}
                  </h3>
                  <p>
                    {role === "donor"
                      ? "Click '+ Add food' above to publish surplus meals for verified local NGOs in your neighborhood."
                      : `No donations currently available in your PIN code area (${pincode}). You will receive an instant email alert as soon as food is published nearby!`}
                  </p>
                </div>
              )}
            </div>
          </div>
          )}

          {/* Tab 2: Community Shelter Food Requisitions (Donation Asking System) */}
          {dashboardTab === "requisitions" && (
            <div className="dashboard-panel">
              <div className="panel-heading">
                <div>
                  <h2>
                    {role === "donor"
                      ? "Community Shelter Food Needs (Pledge Surplus Meals)"
                      : "Community Shelter Food Requisitions (Donation Asking System)"}
                  </h2>
                  <p>
                    {role === "donor"
                      ? "Local shelters and relief charities need food. Pledge cooked surplus meals directly to fulfill their requisitions."
                      : "Broadcast urgent food needs for homeless shelters, orphanages, and relief drives. Donors in your PIN code can pledge meals directly."}
                  </p>
                </div>

                {role === "ngo" && (
                  <button
                    className="primary-button compact"
                    onClick={() => {
                      setShowRequisitionForm(!showRequisitionForm);
                      setNotice("");
                    }}
                  >
                    {showRequisitionForm ? "Cancel" : "+ Ask for Food / Post Requisition"}
                  </button>
                )}
              </div>

              {/* NGO Post Requisition Form */}
              {showRequisitionForm && role === "ngo" && (
                <form className="food-form" onSubmit={createRequisition}>
                  <h3>Post Urgent Food Requisition (Shelter Need)</h3>

                  {/* Receiving Facility / Shelter Branch Selector for NGOs */}
                  {(() => {
                    const branches = getUserBranches(currentUser);
                    return (
                      <div style={{ marginBottom: "14px", background: "rgba(34, 197, 94, 0.06)", border: "1px solid rgba(34, 197, 94, 0.25)", borderRadius: "10px", padding: "12px 14px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                          <span style={{ fontSize: "12.5px", fontWeight: 700, color: "#86efac" }}>
                            🏠 Receiving Shelter / Facility Property:
                          </span>
                          <button
                            type="button"
                            className="text-button"
                            style={{ fontSize: "11.5px", padding: 0 }}
                            onClick={() => openAccountModal("branches")}
                          >
                            + Manage Shelters ({branches.length})
                          </button>
                        </div>
                        <select
                          className="branch-property-select"
                          onChange={(e) => {
                            const id = e.target.value;
                            const chosen = branches.find((b) => b.id === id);
                            if (chosen) {
                              setReqAddress(chosen.address);
                              setReqPincode(chosen.pincode);
                              if (chosen.contactPerson) setReqContactPerson(chosen.contactPerson);
                              if (chosen.phone) setReqContactPhone(chosen.phone);
                              showBanner(`Shelter location set to: ${chosen.name} (PIN ${chosen.pincode})`, "info");
                            }
                          }}
                          style={{ width: "100%", backgroundColor: "#ffffff", color: "#111827", border: "1px solid #d1d5db" }}
                        >
                          {branches.map((b) => (
                            <option key={b.id} value={b.id} style={{ backgroundColor: "#ffffff", color: "#111827" }}>
                              {b.name} — PIN {b.pincode} ({b.address})
                            </option>
                          ))}
                        </select>
                      </div>
                    );
                  })()}

                  <label>
                    Requisition Title
                    <input
                      value={reqTitle}
                      onChange={(e) => setReqTitle(e.target.value)}
                      placeholder="e.g. Dinner for 50 People at Rain Basera Night Shelter"
                      required
                    />
                  </label>

                  <div className="form-grid">
                    <label>
                      Target Beneficiary
                      <select
                        value={reqBeneficiary}
                        onChange={(e) => setReqBeneficiary(e.target.value)}
                      >
                        <option>Night Shelter for Homeless</option>
                        <option>Children's Home / Orphanage</option>
                        <option>Senior Citizen Care Home</option>
                        <option>Disaster Relief Camp</option>
                        <option>Community Kitchen / Langar</option>
                      </select>
                    </label>

                    <label>
                      Number of Meals Needed
                      <input
                        type="number"
                        min="1"
                        max="5000"
                        value={reqMeals}
                        onChange={(e) => setReqMeals(e.target.value)}
                        required
                      />
                    </label>

                    <label>
                      Food Category Preferred
                      <select
                        value={reqCategory}
                        onChange={(e) => setReqCategory(e.target.value)}
                      >
                        <option>Cooked Vegetarian Meals</option>
                        <option>Nutritious Khichdi / Dal Rice</option>
                        <option>Fresh Rotis &amp; Sabzi</option>
                        <option>High-Protein / Dairy</option>
                        <option>Packed Dry Rations</option>
                      </select>
                    </label>

                    <label>
                      Urgency Level
                      <select
                        value={reqUrgency}
                        onChange={(e) => setReqUrgency(e.target.value)}
                      >
                        <option>Tonight's Dinner (by 8 PM)</option>
                        <option>Immediate Lunch (Within 2 Hours)</option>
                        <option>Breakfast Tomorrow Morning</option>
                        <option>Ongoing Daily Need</option>
                      </select>
                    </label>
                  </div>

                  <div className="form-grid">
                    <label>
                      Delivery / Pickup Preference
                      <select
                        value={reqDeliveryPref}
                        onChange={(e) => setReqDeliveryPref(e.target.value)}
                      >
                        <option>NGO Volunteer Pickup (We bring rescue van)</option>
                        <option>Request Donor Kitchen Delivery</option>
                        <option>Community Volunteer Transport</option>
                      </select>
                    </label>

                    <label>
                      Shelter / Drop-off PIN Code
                      <input
                        value={reqPincode}
                        onChange={(e) =>
                          setReqPincode(e.target.value.replace(/\D/g, "").slice(0, 6))
                        }
                        placeholder="6-digit PIN"
                        maxLength={6}
                        required
                      />
                    </label>
                  </div>

                  <div className="form-grid">
                    <label>
                      On-site Contact Person
                      <input
                        value={reqContactPerson}
                        onChange={(e) => setReqContactPerson(e.target.value)}
                        placeholder="e.g. Ramesh Kumar (Shelter In-Charge)"
                        required
                      />
                    </label>

                    <label>
                      Contact Mobile Number
                      <input
                        type="tel"
                        value={reqContactPhone}
                        onChange={(e) =>
                          setReqContactPhone(e.target.value.replace(/\D/g, "").slice(0, 10))
                        }
                        placeholder="10-digit phone"
                        maxLength={10}
                        required
                      />
                    </label>
                  </div>

                  <label>
                    Shelter Full Address
                    <input
                      value={reqAddress}
                      onChange={(e) => setReqAddress(e.target.value)}
                      placeholder="e.g. Shelter #4, Near City Bus Terminal"
                      required
                    />
                  </label>

                  <label>
                    Dietary or Special Notes
                    <input
                      value={reqNote}
                      onChange={(e) => setReqNote(e.target.value)}
                      placeholder="e.g. Suitable for senior citizens, low spice preferred"
                    />
                  </label>

                  <button
                    className="box start-btn primary-submit-btn"
                    type="submit"
                    style={{ "--w": "100%", "--h": "58px", "--tr": "15%", marginTop: "20px" }}
                  >
                    <span className="text">Broadcast Food Requisition to PIN {reqPincode} Donors</span>
                    <CapsuleChevron />
                    <div className="circle-overlay" />
                  </button>
                </form>
              )}

              {/* Requisitions Feed */}
              <div className="requisition-grid">
                {requisitions.map((req) => {
                  const isMyReq =
                    role === "ngo" &&
                    req.ngoName.toLowerCase() === name.trim().toLowerCase();
                  return (
                    <article key={req.id} className="requisition-card">
                      <div className="requisition-header">
                        <div>
                          <span className="urgency-tag">{req.urgency}</span>
                          <span
                            className={`status status-${req.status.toLowerCase()}`}
                            style={{ marginLeft: "6px" }}
                          >
                            {req.status}
                          </span>
                        </div>
                        <span className="pincode-pill">PIN: {req.pincode}</span>
                      </div>

                      <h3 style={{ margin: "10px 0 6px 0", fontSize: "17px" }}>{req.title}</h3>
                      <p style={{ margin: "0 0 6px 0", color: "#e2e8f0" }}>
                        <strong>🍱 {req.mealsNeeded} Meals Needed</strong> · {req.categoryPreferred}
                      </p>

                      <div className="badge-group" style={{ marginBottom: "8px" }}>
                        <span className="meta-pill">🏠 {req.beneficiaryType}</span>
                        <span className="meta-pill">🚚 {req.deliveryPreference}</span>
                      </div>

                      <p style={{ fontSize: "13px", color: "#94a3b8", margin: "4px 0" }}>
                        📍 {req.address}
                      </p>
                      <p style={{ fontSize: "13px", color: "#94a3b8", margin: "4px 0" }}>
                        NGO: <b>{req.ngoName}</b> · Contact: {req.contactPerson} ({req.contactPhone})
                      </p>

                      {req.note && (
                        <p className="request-note" style={{ margin: "8px 0" }}>
                          💬 &ldquo;{req.note}&rdquo;
                        </p>
                      )}

                      {req.status === "Pledged" && (
                        <div className="collection-summary" style={{ margin: "10px 0" }}>
                          🤝 <b>Pledged by {req.pledgedBy}</b> ({req.pledgedMeals} meals · {req.pledgedReadyTime})
                          {req.pledgeNote && <div>Note: {req.pledgeNote}</div>}
                        </div>
                      )}

                      {req.status === "Fulfilled" && (
                        <div className="collection-summary" style={{ margin: "10px 0", color: "#4ade80" }}>
                          ✅ <b>Fulfilled &amp; Delivered</b> at {req.fulfilledAt || "Today"}.
                        </div>
                      )}

                      <div style={{ marginTop: "12px", display: "flex", gap: "8px" }}>
                        {role === "donor" && req.status === "Open" && (
                          <button
                            className="primary-button compact"
                            onClick={() => openPledgeModal(req.id)}
                          >
                            🍲 Pledge Food to Fulfill Need
                          </button>
                        )}

                        {role === "ngo" && isMyReq && req.status === "Pledged" && (
                          <button
                            className="primary-button compact"
                            onClick={() => confirmRequisitionFulfilled(req.id)}
                          >
                            ✓ Confirm Food Received
                          </button>
                        )}

                        {role === "ngo" && isMyReq && req.status === "Open" && (
                          <button
                            className="secondary-button compact remove-button"
                            onClick={() => {
                              updateRequisitionsAndBroadcast((current) =>
                                current.filter((r) => r.id !== req.id)
                              );
                              showBanner("Requisition cancelled.", "warning");
                            }}
                          >
                            Cancel Requisition
                          </button>
                        )}
                      </div>
                    </article>
                  );
                })}

                {requisitions.length === 0 && (
                  <div className="empty-state" style={{ gridColumn: "1 / -1" }}>
                    <span>🍲</span>
                    <h3>No community requisitions posted yet</h3>
                    <p>
                      {role === "ngo"
                        ? "Click '+ Ask for Food / Post Requisition' above to broadcast shelter meal needs to local restaurants and hostels."
                        : "No shelters have open requisitions right now. When a shelter asks for food, it will appear here."}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Tab 3: Premium Plans & Membership */}
          {dashboardTab === "plans" && (
            <PremiumPlansSection
              role={role}
              subscriptionStatus={userSubStatus}
              onOpenCheckout={() => setShowCheckoutModal(true)}
              onSimulateEmail={(type) => triggerEmailToast(type)}
              onToggleBan={(banned) => handleToggleBan(banned)}
              isOverdueBanned={isOverdueBanned}
              userEmail={currentUser?.email || email}
            />
          )}

          <p className="demo-note">
            AnnaSetu Platform · Verified PIN Code Matching · Hyperlocal Food Redistribution Network.
          </p>
        </section>
      )}

      {/* Modal 1: NGO Request Food Modal (All Options) */}
      {activeRequestFoodId !== null && (() => {
        const targetFood = foods.find((f) => f.id === activeRequestFoodId);
        return (
          <div className="modal-backdrop" role="presentation">
            <section
              className="confirm-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="request-modal-title"
            >
              <span className="confirm-icon request-icon">🤝</span>
              <h2 id="request-modal-title">Request Surplus Food Rescue</h2>
              <p>
                Coordinate pickup vehicle and volunteer details with the donor kitchen.
                Automated notifications will be sent to both email inboxes.
              </p>

              <form className="modal-form" onSubmit={submitNgoRequest}>
                {targetFood && (
                  <div className="portion-toggle-group">
                    <label>Rescue Batch Portion</label>
                    <div style={{ display: "flex", gap: "8px", marginTop: "4px", marginBottom: "8px" }}>
                      <button
                        type="button"
                        className={`switcher-pill ${portionType === "full" ? "active" : ""}`}
                        onClick={() => setPortionType("full")}
                      >
                        Full Batch ({targetFood.quantity} {targetFood.unit})
                      </button>
                      <button
                        type="button"
                        className={`switcher-pill ${portionType === "partial" ? "active" : ""}`}
                        onClick={() => setPortionType("partial")}
                      >
                        Partial Portion Rescue
                      </button>
                    </div>
                    {portionType === "partial" && (
                      <label style={{ marginTop: "6px" }}>
                        Quantity to Rescue ({targetFood.unit})
                        <input
                          type="number"
                          min="1"
                          max={targetFood.quantity}
                          value={portionQuantity}
                          onChange={(e) => setPortionQuantity(e.target.value)}
                          required
                        />
                      </label>
                    )}
                  </div>
                )}

                <div className="form-grid">
                  <label>
                    Pickup Volunteer Name
                    <input
                      value={volunteerName}
                      onChange={(e) => setVolunteerName(e.target.value)}
                      placeholder="e.g. Aarav Sharma"
                      required
                    />
                  </label>

                  <label>
                    Volunteer Contact Phone
                    <input
                      type="tel"
                      value={contactPhone}
                      onChange={(e) =>
                        setContactPhone(e.target.value.replace(/\D/g, "").slice(0, 10))
                      }
                      placeholder="10-digit mobile number"
                      required
                    />
                  </label>
                </div>

                <div className="form-grid">
                  <label>
                    Estimated Arrival Time (ETA)
                    <select
                      value={pickupEta}
                      onChange={(e) => setPickupEta(e.target.value)}
                    >
                      <option>Within 20 mins</option>
                      <option>Within 30 mins</option>
                      <option>Within 45 mins</option>
                      <option>Within 1 hour</option>
                    </select>
                  </label>

                  <label>
                    Rescue Vehicle
                    <select
                      value={requestVehicle}
                      onChange={(e) => setRequestVehicle(e.target.value)}
                    >
                      <option>Insulated Food Rescue Van</option>
                      <option>Refrigerated Cold-Chain Van (4°C)</option>
                      <option>Covered Auto-Rickshaw with Thermal Crates</option>
                      <option>Two-Wheeler with Insulated Delivery Bag</option>
                    </select>
                  </label>
                </div>

                <div className="form-grid">
                  <label>
                    Thermal Transport Equipment
                    <select
                      value={requestEquipment}
                      onChange={(e) => setRequestEquipment(e.target.value)}
                    >
                      <option>Thermal Insulation Boxes (&gt;60°C)</option>
                      <option>Cold-Pack Ice Chest (&lt;4°C)</option>
                      <option>Stainless Steel Sealed Tiffin Carriers</option>
                      <option>Hygienic Covered Crates</option>
                    </select>
                  </label>

                  <label>
                    Destination / Shelter Beneficiary
                    <select
                      value={requestBeneficiary}
                      onChange={(e) => setRequestBeneficiary(e.target.value)}
                    >
                      <option>Community Night Shelter (Homeless)</option>
                      <option>Children's Home / Orphanage</option>
                      <option>Senior Citizen Care Home</option>
                      <option>Daily Wage Labor Colony</option>
                      <option>Community Kitchen / Langar</option>
                    </select>
                  </label>
                </div>

                <label>
                  Vehicle &amp; Container Details Note
                  <input
                    value={requestNote}
                    onChange={(e) => setRequestNote(e.target.value)}
                    placeholder="e.g. Insulated food rescue van with thermal boxes"
                  />
                </label>

                <div className="confirm-actions">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => setActiveRequestFoodId(null)}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="primary-button">
                    Submit Rescue Request →
                  </button>
                </div>
              </form>
            </section>
          </div>
        );
      })()}

      {/* Modal 1.5: Donor Pledge Requisition Modal */}
      {pledgingReqId !== null && (() => {
        const reqToPledge = requisitions.find((r) => r.id === pledgingReqId);
        return (
          <div className="modal-backdrop" role="presentation">
            <section
              className="confirm-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="pledge-modal-title"
            >
              <span className="confirm-icon request-icon">🍲</span>
              <h2 id="pledge-modal-title">Pledge Food to Fulfill Need</h2>
              <p>
                You are pledging surplus meals to <strong>{reqToPledge?.ngoName}</strong> for{" "}
                <strong>{reqToPledge?.title}</strong> ({reqToPledge?.mealsNeeded} meals needed).
              </p>

              <form className="modal-form" onSubmit={submitDonorPledge}>
                <div className="form-grid">
                  <label>
                    Number of Meals Pledged
                    <input
                      type="number"
                      min="1"
                      max="5000"
                      value={pledgeMeals}
                      onChange={(e) => setPledgeMeals(e.target.value)}
                      required
                    />
                  </label>

                  <label>
                    Estimated Ready Time
                    <select
                      value={pledgeReadyTime}
                      onChange={(e) => setPledgeReadyTime(e.target.value)}
                    >
                      <option>Ready immediately</option>
                      <option>Ready in 30 mins</option>
                      <option>Ready in 1 hour</option>
                      <option>Ready by 7:30 PM (Dinner)</option>
                      <option>Ready by 8:30 PM (Dinner)</option>
                    </select>
                  </label>
                </div>

                <label>
                  Donor Preparation Note
                  <input
                    value={pledgeNote}
                    onChange={(e) => setPledgeNote(e.target.value)}
                    placeholder="e.g. Freshly cooked veg biryani packed in hot thermal containers"
                  />
                </label>

                <div className="confirm-actions">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => setPledgingReqId(null)}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="primary-button">
                    Confirm Food Pledge →
                  </button>
                </div>
              </form>
            </section>
          </div>
        );
      })()}

      {/* Modal 2: Donor Reject Request Modal */}
      {rejectingFoodId !== null && (
        <div className="modal-backdrop" role="presentation">
          <section
            className="confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reject-modal-title"
          >
            <span className="confirm-icon">⚠️</span>
            <h2 id="reject-modal-title">Decline NGO Request?</h2>
            <p>
              Declining this request will record feedback and make this listing{" "}
              <b>Available</b> again for other verified shelters.
            </p>

            <form className="modal-form" onSubmit={confirmRejectRequest}>
              <label>
                Reason for declining
                <select
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                >
                  <option>Pickup timing does not match our kitchen hours</option>
                  <option>Need an insulated or refrigerated vehicle for this batch</option>
                  <option>Volunteer contact number unreachable</option>
                  <option>Other operational reason</option>
                </select>
              </label>

              <div className="confirm-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setRejectingFoodId(null)}
                >
                  Go back
                </button>
                <button type="submit" className="primary-button danger-button">
                  Decline Request
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {/* Modal 3: Donor Collection OTP Verification Modal */}
      {verifyingCollectionId !== null && (
        <div className="modal-backdrop" role="presentation">
          <section
            className="confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="verify-modal-title"
          >
            <span className="confirm-icon request-icon">🔐</span>
            <h2 id="verify-modal-title">Verify Pickup Handover</h2>
            <p>
              Enter the 4-digit Handover OTP provided by the NGO volunteer upon parcel collection to
              authenticate handover.
            </p>

            <form className="modal-form" onSubmit={completeCollection}>
              <label>
                4-Digit Pickup Handover OTP
                <input
                  value={enteredOtp}
                  onChange={(e) => setEnteredOtp(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  placeholder="Enter 4-digit code"
                  maxLength={4}
                  autoFocus
                  required
                />
              </label>

              <div className="confirm-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setVerifyingCollectionId(null)}
                >
                  Cancel
                </button>
                <button type="submit" className="primary-button">
                  Verify & Hand Over
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {/* Modal 4: Confirm Listing Removal */}
      {confirmRemove !== null && (
        <div className="modal-backdrop" role="presentation">
          <section
            className="confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="remove-title"
          >
            <span className="confirm-icon">🗑️</span>
            <h2 id="remove-title">Remove Surplus Listing?</h2>
            <p>This will remove your food listing from the rescue network.</p>
            <div className="confirm-actions">
              <button
                className="secondary-button"
                onClick={() => setConfirmRemove(null)}
              >
                Keep listing
              </button>
              <button
                className="primary-button danger-button"
                onClick={() => removeFood(confirmRemove)}
              >
                Yes, remove
              </button>
            </div>
          </section>
        </div>
      )}

      {/* Modal 5: User Account Details & Multi-Branch / Property Management */}
      {showAccountModal && currentUser && (() => {
        const userBranches = getUserBranches(currentUser);
        return (
          <div className="modal-backdrop" role="presentation">
            <section
              className="confirm-modal account-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="account-modal-title"
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
                <div>
                  <span className="confirm-icon request-icon" style={{ display: "inline-grid", verticalAlign: "middle", marginRight: "10px" }}>🏢</span>
                  <h2 id="account-modal-title" style={{ display: "inline", verticalAlign: "middle" }}>Account &amp; Properties</h2>
                </div>
                <button
                  type="button"
                  className="secondary-button compact"
                  onClick={() => setShowAccountModal(false)}
                  style={{ borderRadius: "50%", width: "32px", height: "32px", padding: 0, minWidth: 0, display: "grid", placeItems: "center" }}
                  title="Close modal"
                >
                  ✕
                </button>
              </div>

              <p style={{ color: "#94a3b8", fontSize: "13px", marginTop: "4px" }}>
                Manage your verified organization profile, contact information, and multiple physical operating branches / properties.
              </p>

              {/* Account Navigation Tabs */}
              <div className="account-tabs">
                <button
                  type="button"
                  className={`account-tab-btn ${accountTab === "profile" ? "active" : ""}`}
                  onClick={() => setAccountTab("profile")}
                >
                  👤 Profile Details
                </button>
                <button
                  type="button"
                  className={`account-tab-btn ${accountTab === "branches" ? "active" : ""}`}
                  onClick={() => setAccountTab("branches")}
                >
                  🏢 Branches &amp; Properties ({userBranches.length})
                </button>
              </div>

              {/* Tab 1: Profile Details Form */}
              {accountTab === "profile" && (
                <form className="modal-form" onSubmit={handleSaveProfile}>
                  <label>
                    {currentUser.role === "donor" ? "Establishment / Restaurant Name" : "Registered NGO Name"}
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder="e.g. McDonald's or Feeding India"
                      required
                    />
                  </label>

                  <div className="form-grid">
                    <label>
                      Account Email (Verified)
                      <input
                        value={currentUser?.email || email}
                        disabled
                        style={{ opacity: 0.7, cursor: "not-allowed" }}
                      />
                    </label>
                    <label>
                      Contact Phone
                      <input
                        value={editPhone}
                        onChange={(e) => setEditPhone(e.target.value)}
                        placeholder="e.g. 9876543210"
                        required
                      />
                    </label>
                  </div>

                  <div className="form-grid">
                    <label>
                      Primary Operating Address
                      <input
                        value={editAddress}
                        onChange={(e) => setEditAddress(e.target.value)}
                        placeholder="e.g. Sector 18 Commercial Hub"
                        required
                      />
                    </label>
                    <label>
                      Postal PIN Code (Hyperlocal Matching)
                      <input
                        value={editPincode}
                        onChange={(e) => setEditPincode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                        placeholder="6-digit PIN"
                        maxLength={6}
                        required
                      />
                    </label>
                  </div>

                  {currentUser.role === "donor" ? (
                    <div className="form-grid">
                      <label>
                        FSSAI License Number (14 Digits)
                        <input
                          value={editFssaiNumber}
                          onChange={(e) => setEditFssaiNumber(e.target.value.replace(/\D/g, "").slice(0, 14))}
                          placeholder="14-digit FSSAI License"
                          maxLength={14}
                        />
                      </label>
                      <label>
                        FSSAI Registered Operator Name
                        <input
                          value={editFssaiName}
                          onChange={(e) => setEditFssaiName(e.target.value)}
                          placeholder="Operator name as in FSSAI license"
                        />
                      </label>
                    </div>
                  ) : (
                    <div className="form-grid">
                      <label>
                        NGO Registration / Darpan ID
                        <input
                          value={editRegistrationNo}
                          onChange={(e) => setEditRegistrationNo(e.target.value)}
                          placeholder="e.g. DL/2019/0246221"
                        />
                      </label>
                      <label>
                        Rescue Vehicle Type
                        <select
                          value={editVehicleType}
                          onChange={(e) => setEditVehicleType(e.target.value)}
                        >
                          <option>Insulated Food Rescue Van</option>
                          <option>Refrigerated Cold-Chain Van</option>
                          <option>Covered Two-Wheeler with Thermal Box</option>
                          <option>E-Rickshaw Rescue Cart</option>
                        </select>
                      </label>
                    </div>
                  )}

                  <div className="confirm-actions" style={{ marginTop: "20px" }}>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => setShowAccountModal(false)}
                    >
                      Cancel
                    </button>
                    <button type="submit" className="primary-button">
                      Save Profile Changes
                    </button>
                  </div>
                </form>
              )}

              {/* Tab 2: Branches & Properties List */}
              {accountTab === "branches" && (
                <div>
                  {branchEditingId !== null ? (
                    /* Branch Add / Edit Form */
                    <form className="branch-form-box" onSubmit={handleSaveBranch}>
                      <h4>{branchEditingId === "new" ? "➕ Add New Branch / Property" : "✏️ Edit Branch Details"}</h4>

                      <div className="form-grid">
                        <label>
                          Branch / Property Name
                          <input
                            value={branchName}
                            onChange={(e) => setBranchName(e.target.value)}
                            placeholder="e.g. Sector 62 Cloud Kitchen"
                            required
                          />
                        </label>
                        <label>
                          Branch PIN Code (Local NGO Alerts)
                          <input
                            value={branchPincode}
                            onChange={(e) => setBranchPincode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                            placeholder="6-digit PIN"
                            maxLength={6}
                            required
                          />
                        </label>
                      </div>

                      <label>
                        Branch Street Address
                        <input
                          value={branchAddress}
                          onChange={(e) => setBranchAddress(e.target.value)}
                          placeholder="e.g. Plot B-4, Industrial Area, Sector 62"
                          required
                        />
                      </label>

                      <div className="form-grid">
                        <label>
                          Branch Manager / Contact Person
                          <input
                            value={branchContactPerson}
                            onChange={(e) => setBranchContactPerson(e.target.value)}
                            placeholder="e.g. Rohan Verma"
                          />
                        </label>
                        <label>
                          Branch Contact Phone
                          <input
                            value={branchPhone}
                            onChange={(e) => setBranchPhone(e.target.value)}
                            placeholder="e.g. 9811223344"
                          />
                        </label>
                      </div>

                      <label>
                        Loading Dock / Kitchen Access Instructions
                        <input
                          value={branchAccessNotes}
                          onChange={(e) => setBranchAccessNotes(e.target.value)}
                          placeholder="e.g. Gate 3 basement service entrance"
                        />
                      </label>

                      <div style={{ display: "flex", gap: "8px", marginTop: "14px", justifyContent: "flex-end" }}>
                        <button
                          type="button"
                          className="secondary-button compact"
                          onClick={() => setBranchEditingId(null)}
                        >
                          Cancel
                        </button>
                        <button type="submit" className="primary-button compact">
                          {branchEditingId === "new" ? "Save New Branch" : "Update Branch"}
                        </button>
                      </div>
                    </form>
                  ) : (
                    <>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
                        <span style={{ fontSize: "13px", color: "#cbd5e1" }}>
                          You have <b>{userBranches.length}</b> registered {userBranches.length === 1 ? "property" : "properties"}:
                        </span>
                        <button
                          type="button"
                          className="primary-button compact"
                          onClick={handleStartAddBranch}
                        >
                          + Add Branch / Property
                        </button>
                      </div>

                      <div className="branch-list">
                        {userBranches.map((br) => (
                          <div key={br.id} className={`branch-card ${br.isPrimary ? "is-primary" : ""}`}>
                            <div className="branch-info">
                              <h4>
                                {br.name}
                                {br.isPrimary && <span className="branch-primary-pill">Primary Location</span>}
                              </h4>
                              <p>📍 {br.address} (PIN: <strong>{br.pincode}</strong>)</p>
                              {br.contactPerson && (
                                <small>👤 Contact: {br.contactPerson} {br.phone ? `(${br.phone})` : ""}</small>
                              )}
                              {br.accessNotes && (
                                <small style={{ color: "#64748b" }}>🚪 Dock: {br.accessNotes}</small>
                              )}
                            </div>
                            <div className="branch-actions">
                              {!br.isPrimary && (
                                <button
                                  type="button"
                                  className="secondary-button compact"
                                  onClick={() => handleSetPrimaryBranch(br.id)}
                                  title="Set as primary operating property"
                                >
                                  Make Primary
                                </button>
                              )}
                              <button
                                type="button"
                                className="secondary-button compact"
                                onClick={() => handleStartEditBranch(br)}
                                title="Edit this branch"
                              >
                                ✏️ Edit
                              </button>
                              {userBranches.length > 1 && (
                                <button
                                  type="button"
                                  className="secondary-button compact remove-button"
                                  onClick={() => handleDeleteBranch(br.id)}
                                  title="Remove this branch"
                                >
                                  🗑️
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
            </section>
          </div>
        );
      })()}

      {/* Modal: Payment Checkout & Screenshot Upload */}
      <PaymentCheckoutModal
        isOpen={showCheckoutModal}
        onClose={() => setShowCheckoutModal(false)}
        role={role}
        userEmail={currentUser?.email || email}
        userName={currentUser?.name || name}
        adminUpiId={adminUpiId}
        onPaymentSubmitted={() => {
          setSubscriptionsList(getSubscriptions());
          showBanner("Payment screenshot submitted! Status: Pending Verification...", "info");
        }}
        existingSubscription={userSubscription}
      />

      {/* Modal: Payment Required Popup upon Dashboard Load if due */}
      <PaymentRequiredModal
        isOpen={
          (isPaymentDue || userSubStatus === "due") &&
          !paymentDueDismissed &&
          page === "dashboard" &&
          !isOverdueBanned
        }
        onClose={() => setPaymentDueDismissed(true)}
        onPayNow={() => {
          setPaymentDueDismissed(true);
          setShowCheckoutModal(true);
        }}
        role={role}
      />

      {/* Full-Screen Overlay: Account Banned Overdue (5 Days Overdue) */}
      <AccountBannedOverlay
        isOpen={isOverdueBanned && page === "dashboard"}
        onPayNow={() => {
          setShowCheckoutModal(true);
        }}
        onDismissBan={() => handleToggleBan(false)}
        userEmail={currentUser?.email || email}
      />

      {/* Email Toast Notifications Stack */}
      <EmailToastContainer
        toasts={emailToasts}
        onDismiss={(id) => setEmailToasts((prev) => prev.filter((t) => t.id !== id))}
      />

      <footer>
        <span>✳ AnnaSetu Platform</span>
        <span>Hyperlocal Food Waste Reduction Platform.</span>
      </footer>
    </main>
  );
}
