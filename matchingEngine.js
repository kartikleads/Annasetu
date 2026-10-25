/**
 * AnnaSetu AI — Intelligent Matching & Safety Engine with PIN Code Prioritization
 * src/services/matchingEngine.js
 */

export function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return 2.5;

  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Number((R * c).toFixed(1));
}

export function isPickupExpired(pickupValue) {
  if (!pickupValue) return false;
  const deadline = Date.parse(pickupValue);
  if (Number.isNaN(deadline)) return false;
  return deadline < Date.now();
}

export function getRemainingMinutes(pickupValue) {
  if (!pickupValue) return 999;
  const deadline = Date.parse(pickupValue);
  if (Number.isNaN(deadline)) return 999;
  return Math.round((deadline - Date.now()) / (1000 * 60));
}

export function applySafetyExpiry(foods) {
  return foods.map((food) => {
    if (food.status === "Available" && isPickupExpired(food.pickup)) {
      return {
        ...food,
        status: "Unavailable",
        unavailableReason: "Pickup window expired (Automated Safety Lock)",
      };
    }
    return food;
  });
}

/**
 * Multi-factor recommendation engine matching food items to suitable NGOs
 * Factors: PIN Code Match, Urgency, Distance, Storage, Capacity
 */
export function rankNgoMatches(foodItem, ngoList) {
  if (!foodItem || !ngoList || !Array.isArray(ngoList)) return [];

  const remainingMins = getRemainingMinutes(foodItem.pickup);
  const foodQty = Number(foodItem.quantity || 10);
  const foodPincode = String(foodItem.pincode || "").trim();
  const requiresCold =
    foodItem.storageConditions?.toLowerCase().includes("refrigerat") ||
    foodItem.storageConditions?.toLowerCase().includes("cold");

  return ngoList
    .map((ngo) => {
      let score = 50;
      const reasons = [];

      // 1. Exact PIN Code Match Bonus (Top Priority)
      const ngoPincode = String(ngo.pincode || "").trim();
      if (foodPincode && ngoPincode && foodPincode === ngoPincode) {
        score += 25;
        reasons.push(`🎯 Same PIN Code (${foodPincode})`);
      }

      // 2. Urgency Match
      if (remainingMins < 60) {
        score += 20;
        reasons.push("🚨 Urgent: Pickup window closes in < 60 mins");
      } else if (remainingMins < 120) {
        score += 12;
        reasons.push("⚡ Priority: Distribution needed within 2 hours");
      } else {
        score += 5;
        reasons.push("Standard pickup window");
      }

      // 3. Proximity / Distance
      const dist = calculateHaversineDistance(
        foodItem.donorCoords?.lat || 28.4721,
        foodItem.donorCoords?.lng || 77.5054,
        ngo.coords?.lat,
        ngo.coords?.lng
      );

      if (dist <= 2.0) {
        score += 15;
        reasons.push(`📍 Hyperlocal: Just ${dist} km away`);
      } else if (dist <= 5.0) {
        score += 10;
        reasons.push(`📍 Within service area (${dist} km)`);
      } else {
        score += 3;
        reasons.push(`📍 Distance: ${dist} km`);
      }

      // 4. Storage Match
      const hasCold = (ngo.storageFacilities || []).some(
        (f) =>
          f.toLowerCase().includes("refrigerat") ||
          f.toLowerCase().includes("cold")
      );

      if (requiresCold && hasCold) {
        score += 15;
        reasons.push("❄️ Verified cold-chain storage facility match");
      } else if (requiresCold && !hasCold) {
        score -= 20;
        reasons.push("⚠️ Lacks required cold storage capability");
      }

      // 5. Capacity Match
      const capacity = Number(ngo.collectionCapacity || 50);
      if (capacity >= foodQty) {
        score += 10;
        reasons.push(`🚚 Full batch capacity (${capacity} meals max)`);
      } else {
        score -= 10;
        reasons.push(`⚠️ Exceeds single-trip capacity (${capacity}/${foodQty})`);
      }

      const matchScore = Math.min(99, Math.max(35, Math.round(score)));

      return {
        ...ngo,
        distanceKm: dist,
        matchScore,
        reasons,
        isTopRecommendation: matchScore >= 80,
      };
    })
    .sort((a, b) => b.matchScore - a.matchScore);
}

/**
 * Calculates user-scoped impact metrics
 */
export function calculateImpactMetrics(
  foods,
  userRole = "all",
  userName = "",
  userPincode = "",
  requisitions = [],
  userEmail = "",
  userId = ""
) {
  const safeFoods = Array.isArray(foods) ? foods : [];
  const safeReqs = Array.isArray(requisitions) ? requisitions : [];
  const normalizedName = (userName || "").trim().toLowerCase();
  const normalizedPincode = String(userPincode || "").trim();
  const normalizedEmail = (userEmail || "").trim().toLowerCase();
  const normalizedUserId = String(userId || "").trim();

  let mealsRedistributed = 0;
  let wasteAvoidedKg = 0;
  let activeDonations = 0;
  let pendingRequests = 0;
  let completedCollections = 0;

  for (const food of safeFoods) {
    const expired = isPickupExpired(food.pickup);
    const effectiveStatus =
      expired && food.status === "Available" ? "Unavailable" : food.status;

    const isMyDonation =
      (normalizedUserId && food.donorId && String(food.donorId).trim() === normalizedUserId) ||
      (normalizedEmail && food.donorEmail && food.donorEmail.trim().toLowerCase() === normalizedEmail) ||
      (!food.donorId && !food.donorEmail && food.donor && food.donor.trim().toLowerCase() === normalizedName);
    const isMyClaim =
      food.claimedBy && food.claimedBy.trim().toLowerCase() === normalizedName;
    const isMyPincode =
      !normalizedPincode || String(food.pincode).trim() === normalizedPincode;

    if (userRole === "donor") {
      // Donors only count their own items
      if (isMyDonation) {
        if (effectiveStatus === "Available") activeDonations += 1;
        if (effectiveStatus === "Requested" || effectiveStatus === "Accepted") {
          pendingRequests += 1;
        }
        if (effectiveStatus === "Collected") {
          completedCollections += 1;
          const meals =
            food.unit === "meals"
              ? Number(food.quantity)
              : Number(food.quantity) * 2;
          mealsRedistributed += meals;
          const weight =
            Number(food.estimatedWeightKg) ||
            (food.unit === "kg" ? Number(food.quantity) : meals * 0.4);
          wasteAvoidedKg += weight;
        }
      }
    } else if (userRole === "ngo") {
      // NGOs count available items in their PIN (or general) + their own requests
      if (effectiveStatus === "Available" && isMyPincode) {
        activeDonations += 1;
      }
      if (isMyClaim) {
        if (effectiveStatus === "Requested" || effectiveStatus === "Accepted") {
          pendingRequests += 1;
        }
        if (effectiveStatus === "Collected") {
          completedCollections += 1;
          const meals =
            food.unit === "meals"
              ? Number(food.quantity)
              : Number(food.quantity) * 2;
          mealsRedistributed += meals;
          const weight =
            Number(food.estimatedWeightKg) ||
            (food.unit === "kg" ? Number(food.quantity) : meals * 0.4);
          wasteAvoidedKg += weight;
        }
      }
    } else {
      // Global overview
      if (effectiveStatus === "Available") activeDonations += 1;
      if (effectiveStatus === "Requested" || effectiveStatus === "Accepted") {
        pendingRequests += 1;
      }
      if (effectiveStatus === "Collected") {
        completedCollections += 1;
        const meals =
          food.unit === "meals"
            ? Number(food.quantity)
            : Number(food.quantity) * 2;
        mealsRedistributed += meals;
        const weight =
          Number(food.estimatedWeightKg) ||
          (food.unit === "kg" ? Number(food.quantity) : meals * 0.4);
        wasteAvoidedKg += weight;
      }
    }
  }

  // Add impact from fulfilled shelter requisitions
  for (const req of safeReqs) {
    if (req.status === "Fulfilled") {
      const isMyPledge =
        req.pledgedBy && req.pledgedBy.trim().toLowerCase() === normalizedName;
      const isMyNgoReq =
        req.ngoName && req.ngoName.trim().toLowerCase() === normalizedName;
      const meals = Number(req.pledgedMeals || req.mealsNeeded) || 40;
      const weight = Number((meals * 0.4).toFixed(1));

      if (userRole === "donor" && isMyPledge) {
        mealsRedistributed += meals;
        wasteAvoidedKg += weight;
        completedCollections += 1;
      } else if (userRole === "ngo" && isMyNgoReq) {
        mealsRedistributed += meals;
        wasteAvoidedKg += weight;
        completedCollections += 1;
      } else if (userRole !== "donor" && userRole !== "ngo") {
        mealsRedistributed += meals;
        wasteAvoidedKg += weight;
        completedCollections += 1;
      }
    }
  }

  return {
    activeDonations,
    pendingRequests,
    completedCollections,
    totalListings: safeFoods.length,
    mealsRedistributed,
    wasteAvoidedKg: Number(wasteAvoidedKg.toFixed(1)),
  };
}
