const { landPackages, projectFeatures } = require("../data/landPackages");

function toNumber(value) {
  if (!value) return 0;
  if (typeof value === "number") return value;
  return Number(String(value).replace(/[^0-9.]/g, "")) || 0;
}

function formatIndianCurrency(amount) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0
  }).format(amount || 0);
}

function recommendPackage({ budget, interestLevel, preferredPackageId }) {
  const budgetNumber = toNumber(budget);

  if (preferredPackageId) {
    const selected = landPackages.find((pkg) => pkg.id === preferredPackageId);
    if (selected) return selected;
  }

  if (!budgetNumber) {
    return landPackages[0];
  }

  const affordable = landPackages
    .filter((pkg) => pkg.investmentAmount <= budgetNumber)
    .sort((a, b) => b.investmentAmount - a.investmentAmount);

  if (affordable.length > 0) {
    return affordable[0];
  }

  if (String(interestLevel).toLowerCase().includes("high")) {
    return landPackages[1];
  }

  return landPackages[0];
}

function getLeadScore({ budget, status, interestLevel, nextFollowUpDate }) {
  let score = 30;
  const budgetNumber = toNumber(budget);

  if (budgetNumber >= 3500000) score += 30;
  else if (budgetNumber >= 1800000) score += 25;
  else if (budgetNumber >= 800000) score += 20;
  else if (budgetNumber >= 400000) score += 15;

  if (["Interested", "Site Visit", "Booking", "Payment"].includes(status)) score += 20;
  if (String(interestLevel).toLowerCase() === "high") score += 20;
  if (nextFollowUpDate) score += 10;

  return Math.min(score, 100);
}

function generateSlots() {
  const slots = [];
  const today = new Date();
  let cursor = new Date(today);

  while (slots.length < 6) {
    cursor.setDate(cursor.getDate() + 1);
    const day = cursor.getDay();
    if (day === 0) continue;

    const date = cursor.toISOString().slice(0, 10);
    slots.push(`${date} - 10:30 AM phone follow-up`);
    if (slots.length < 6) slots.push(`${date} - 04:00 PM site visit discussion`);
  }

  return slots;
}

function generateConfirmationMessage(lead, selectedPackage) {
  const name = lead.name || "Customer";
  const followDate = lead.nextFollowUpDate || "the next available date";

  return `Dear ${name}, thank you for your enquiry with Lohitha Dharma Projects Pvt. Ltd. Based on your interest, we suggest ${selectedPackage.name}. Package details: ${selectedPackage.areaSqYards} sq. yards (${selectedPackage.areaCents} cents), investment ${selectedPackage.displayPrice}, location ${selectedPackage.location}. Key facilities include ${projectFeatures.slice(0, 6).join(", ")}. Our team will contact you on ${followDate} to explain documents, site visit options, and next steps. Note: return values are brochure-based claims and should be verified before booking.`;
}

function generateRecommendation(lead) {
  const selectedPackage = recommendPackage(lead);
  const score = getLeadScore(lead);
  const slots = generateSlots();
  const confirmationMessage = generateConfirmationMessage(lead, selectedPackage);

  let priority = "Medium";
  if (score >= 75) priority = "High";
  if (score < 50) priority = "Low";

  return {
    selectedPackage,
    leadScore: score,
    priority,
    suggestedSlots: slots,
    confirmationMessage,
    suggestedAction: priority === "High" ? "Call immediately and offer site visit discussion" : "Schedule follow-up and share package details",
    features: projectFeatures
  };
}

module.exports = {
  generateRecommendation,
  formatIndianCurrency,
  landPackages,
  projectFeatures
};
