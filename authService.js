/**
 * AnnaSetu AI — User Authentication & Tab-Isolated Session Storage
 * src/services/authService.js
 */

const USERS_STORAGE_KEY = "annasetu-users-v3";
const CURRENT_USER_KEY = "annasetu-current-user-v3";
const ADMIN_SESSION_KEY = "annasetu-admin-session";

export const ADMIN_PASSWORD = "mayankaggarwal";

const DEFAULT_USERS = [
  {
    id: "usr-demo-donor",
    name: "McDonald's",
    email: "mcdonalds@cprl.in",
    password: "password123",
    role: "donor",
    pincode: "240494",
    phone: "9876543210",
    address: "Mall Road, Ground Floor, Sector 18 (PIN: 240494)",
    fssaiNumber: "10014011001648",
    fssaiName: "McDonald's (Connaught Plaza Restaurants Pvt Ltd)",
    fssaiVerified: true,
    isDemo: true,
    verified: true,
    branches: [
      {
        id: "br-mcd-1",
        name: "Mall Road Sector 18 (Flagship Outlet)",
        address: "Mall Road, Ground Floor, Sector 18",
        pincode: "240494",
        contactPerson: "Rajesh Kumar (Store Manager)",
        phone: "9876543210",
        accessNotes: "Rear service elevator, Gate 2",
        isPrimary: true,
      },
      {
        id: "br-mcd-2",
        name: "Sector 62 IT Park (Express Outlet)",
        address: "Food Court, Tower B, Sector 62",
        pincode: "201309",
        contactPerson: "Rohan Verma",
        phone: "9811223344",
        accessNotes: "Dock 4 freight lift",
        isPrimary: false,
      },
    ],
  },
  {
    id: "usr-demo-ngo",
    name: "Feeding India Charity Trust",
    email: "rescue@feedingindia.org",
    password: "password123",
    role: "ngo",
    pincode: "240494",
    phone: "9876543210",
    address: "Regional Relief Operations, Sector 18 (PIN: 240494)",
    registrationNo: "DL/2019/0246221",
    collectionCapacity: 250,
    storageFacilities: ["Refrigeration Cold Room (4°C)", "Insulated Thermal Boxes"],
    vehicleType: "Insulated Food Rescue Van",
    isDemo: true,
    verified: true,
    branches: [
      {
        id: "br-ngo-1",
        name: "Regional Relief Operations Hub (Sector 18)",
        address: "Regional Relief Operations, Sector 18",
        pincode: "240494",
        contactPerson: "Aarav Sharma",
        phone: "9876543210",
        accessNotes: "Main vehicle loading bay",
        isPrimary: true,
      },
      {
        id: "br-ngo-2",
        name: "Community Food Bank & Distribution Shelter (Sector 22)",
        address: "Shelter 4, Community Centre, Sector 22",
        pincode: "201301",
        contactPerson: "Priya Nair",
        phone: "9822334455",
        accessNotes: "Shelter side gate access",
        isPrimary: false,
      },
    ],
  },
];

export function getRegisteredUsers() {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      localStorage.removeItem("annasetu-users");
      localStorage.removeItem("annasetu-users-v2");
    }

    const raw = localStorage.getItem(USERS_STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(DEFAULT_USERS));
      return DEFAULT_USERS;
    }
    let parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      parsed = DEFAULT_USERS;
    }

    // Auto-migrate: purge all legacy mock users (Green Leaf, Helping Hands, etc.)
    parsed = parsed.filter((u) => {
      const name = (u.name || "").toLowerCase();
      const email = (u.email || "").toLowerCase();
      if (
        name.includes("green leaf") ||
        email.includes("greenleaf") ||
        name.includes("helping hands") ||
        email.includes("helpinghands")
      ) {
        return false;
      }
      return true;
    });

    // Ensure baseline clean demos are present
    if (!parsed.some((u) => u.email === "mcdonalds@cprl.in")) {
      parsed.unshift(DEFAULT_USERS[0]);
    } else {
      const mcd = parsed.find((u) => u.email === "mcdonalds@cprl.in");
      if (mcd && (!mcd.branches || mcd.branches.length === 0)) {
        mcd.branches = DEFAULT_USERS[0].branches;
      }
    }
    if (!parsed.some((u) => u.email === "rescue@feedingindia.org")) {
      parsed.push(DEFAULT_USERS[1]);
    } else {
      const ngo = parsed.find((u) => u.email === "rescue@feedingindia.org");
      if (ngo && (!ngo.branches || ngo.branches.length === 0)) {
        ngo.branches = DEFAULT_USERS[1].branches;
      }
    }

    localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(parsed));
    return parsed;
  } catch {
    return DEFAULT_USERS;
  }
}

export async function fetchUsersFromCloud() {
  try {
    const res = await fetch("/api/users");
    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data.users) && data.users.length > 0) {
        const local = getRegisteredUsers();
        const emails = new Set(data.users.map((u) => u.email.toLowerCase()));
        const merged = [...data.users, ...local.filter((u) => !emails.has(u.email.toLowerCase()))];
        localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(merged));
        return merged;
      }
    }
  } catch (err) {
    console.warn("[authService] Cloud users sync warning:", err.message);
  }
  return getRegisteredUsers();
}

export function updateRegisteredUser(userId, patch) {
  const users = getRegisteredUsers();
  const updated = users.map((u) => (u.id === userId ? { ...u, ...patch } : u));
  try {
    localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(updated));
    fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ users: updated }),
    }).catch(() => {});
  } catch (err) {
    console.warn("[authService] Failed to update user:", err.message);
  }
  return updated;
}

export function deleteRegisteredUser(userId) {
  const users = getRegisteredUsers();
  const updated = users.filter((u) => u.id !== userId);
  try {
    localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(updated));
    fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ users: updated }),
    }).catch(() => {});
  } catch (err) {
    console.warn("[authService] Failed to delete user:", err.message);
  }
  return updated;
}

export function verifyAdminPassword(password) {
  return (password || "").trim() === ADMIN_PASSWORD;
}

export function getAdminSession() {
  try {
    if (typeof window === "undefined") return false;
    // Purge any stale localStorage key so visiting /admin always prompts for password
    localStorage.removeItem(ADMIN_SESSION_KEY);
    return false;
  } catch {
    return false;
  }
}

export function setAdminSession(isActive) {
  try {
    if (typeof window === "undefined") return;
    if (isActive) {
      sessionStorage.setItem(ADMIN_SESSION_KEY, "true");
    } else {
      sessionStorage.removeItem(ADMIN_SESSION_KEY);
    }
    localStorage.removeItem(ADMIN_SESSION_KEY);
  } catch (err) {
    console.warn("[authService] Failed to set admin session:", err.message);
  }
}

export function checkUserExists(email) {
  const users = getRegisteredUsers();
  const normalized = (email || "").trim().toLowerCase();
  return users.some((u) => u.email.toLowerCase() === normalized);
}

export function saveUserAccount(userPayload) {
  const users = getRegisteredUsers();
  const normalizedEmail = (userPayload.email || "").trim().toLowerCase();

  const filtered = users.filter((u) => u.email.toLowerCase() !== normalizedEmail);
  const primaryBranch = {
    id: `br-${Date.now()}`,
    name: `${userPayload.name || "Main"} (Primary Property)`,
    address: userPayload.address || "Main Street Commercial Complex",
    pincode: userPayload.pincode || "240494",
    contactPerson: userPayload.name || "Operations Lead",
    phone: userPayload.phone || "9876543210",
    accessNotes: "Primary pickup / reception desk",
    isPrimary: true,
  };

  const newUser = {
    ...userPayload,
    id: `usr-${Date.now()}`,
    email: normalizedEmail,
    branches:
      Array.isArray(userPayload.branches) && userPayload.branches.length > 0
        ? userPayload.branches
        : [primaryBranch],
    verified: true,
    isDemo: false,
    createdAt: new Date().toISOString(),
  };

  const updated = [newUser, ...filtered];
  try {
    localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(updated));
    fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ users: updated }),
    }).catch(() => {});
  } catch (err) {
    console.warn("[authService] Failed to save user:", err.message);
  }
  return newUser;
}

export function verifyCredentials(email, password) {
  const users = getRegisteredUsers();
  const normalizedEmail = (email || "").trim().toLowerCase();
  const user = users.find(
    (u) => u.email.toLowerCase() === normalizedEmail && u.password === password
  );

  if (!user) {
    return {
      success: false,
      error: "Invalid email or password. Please verify your credentials or create an account.",
    };
  }
  return { success: true, user };
}

export function getCurrentSession() {
  try {
    if (typeof window === "undefined") return null;

    let user = null;
    const sessionRaw = sessionStorage.getItem(CURRENT_USER_KEY);
    if (sessionRaw) {
      user = JSON.parse(sessionRaw);
    } else {
      const localRaw = localStorage.getItem(CURRENT_USER_KEY);
      if (localRaw) {
        user = JSON.parse(localRaw);
        sessionStorage.setItem(CURRENT_USER_KEY, localRaw);
      }
    }

    if (user) {
      const name = (user.name || "").toLowerCase();
      const email = (user.email || "").toLowerCase();
      if (
        name.includes("green leaf") ||
        email.includes("greenleaf") ||
        name.includes("helping hands") ||
        email.includes("helpinghands")
      ) {
        clearCurrentSession();
        return null;
      }
    }
    return user;
  } catch {
    return null;
  }
}

export function setCurrentSession(user) {
  try {
    if (typeof window === "undefined") return;

    if (user) {
      const serialized = JSON.stringify(user);
      sessionStorage.setItem(CURRENT_USER_KEY, serialized);
      localStorage.setItem(CURRENT_USER_KEY, serialized);
    } else {
      sessionStorage.removeItem(CURRENT_USER_KEY);
      localStorage.removeItem(CURRENT_USER_KEY);
    }
  } catch (err) {
    console.warn("[authService] Failed to set session:", err.message);
  }
}

export function clearCurrentSession() {
  try {
    if (typeof window === "undefined") return;
    sessionStorage.removeItem(CURRENT_USER_KEY);
    localStorage.removeItem(CURRENT_USER_KEY);
  } catch (err) {
    console.warn("[authService] Failed to clear session:", err.message);
  }
}
