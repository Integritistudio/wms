const { httpError } = require("./httpError");

/** 3-digit ZIP prefix ranges by USPS state/territory. */
const US_ZIP3 = {
  AL: [[350, 369]],
  AK: [[995, 999]],
  AZ: [[850, 865]],
  AR: [[716, 729]],
  CA: [[900, 961]],
  CO: [[800, 816]],
  CT: [[60, 69]],
  DE: [[197, 199]],
  DC: [[200, 205]],
  FL: [[320, 349]],
  GA: [[300, 319], [398, 399]],
  HI: [[967, 968]],
  ID: [[832, 838]],
  IL: [[600, 629]],
  IN: [[460, 479]],
  IA: [[500, 528]],
  KS: [[660, 679]],
  KY: [[400, 427]],
  LA: [[700, 714]],
  ME: [[39, 49]],
  MD: [[206, 219]],
  MA: [[10, 27]],
  MI: [[480, 499]],
  MN: [[550, 567]],
  MS: [[386, 397]],
  MO: [[630, 658]],
  MT: [[590, 599]],
  NE: [[680, 693]],
  NV: [[889, 898]],
  NH: [[30, 38]],
  NJ: [[70, 89]],
  NM: [[870, 884]],
  NY: [[5, 5], [100, 149]],
  NC: [[270, 289]],
  ND: [[580, 588]],
  OH: [[430, 458]],
  OK: [[730, 749]],
  OR: [[970, 979]],
  PA: [[150, 196]],
  RI: [[28, 29]],
  SC: [[290, 299]],
  SD: [[570, 577]],
  TN: [[370, 385]],
  TX: [[750, 799], [885, 885]],
  UT: [[840, 847]],
  VT: [[50, 59]],
  VA: [[201, 201], [220, 246]],
  WA: [[980, 994]],
  WV: [[247, 268]],
  WI: [[530, 549]],
  WY: [[820, 831]],
  PR: [[6, 9]],
  VI: [[8, 8]],
  GU: [[969, 969]],
  AS: [[967, 967]],
  MP: [[969, 969]],
};

const CA_FSA = {
  NL: ["A"],
  NS: ["B"],
  PE: ["C"],
  NB: ["E"],
  QC: ["G", "H", "J"],
  ON: ["K", "L", "M", "N", "P"],
  MB: ["R"],
  SK: ["S"],
  AB: ["T"],
  BC: ["V"],
  NT: ["X"],
  NU: ["X"],
  YT: ["Y"],
};

const AU_POST = {
  NSW: [[2000, 2599], [2619, 2899], [2921, 2999]],
  ACT: [[2600, 2618], [2900, 2920]],
  VIC: [[3000, 3999]],
  QLD: [[4000, 4999]],
  SA: [[5000, 5799]],
  WA: [[6000, 6797]],
  TAS: [[7000, 7999]],
  NT: [[800, 899]],
};

const COUNTRY_FORMAT = {
  US: { pattern: /^\d{5}(-\d{4})?$/, example: "78701" },
  CA: { pattern: /^[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z][ ]?\d[ABCEGHJ-NPRSTV-Z]\d$/i, example: "M5V 2T6", hint: "Canadian postal code, e.g. M5V 2T6" },
  GB: { pattern: /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i, example: "SW1A 1AA", hint: "UK postcode, e.g. SW1A 1AA" },
  AU: { pattern: /^\d{4}$/, example: "2000", hint: "4-digit Australian postcode" },
  IN: { pattern: /^\d{6}$/, example: "110001", hint: "6-digit PIN code" },
  DE: { pattern: /^\d{5}$/, example: "10115", hint: "5-digit German PLZ" },
  FR: { pattern: /^\d{5}$/, example: "75001", hint: "5-digit French code postal" },
  IT: { pattern: /^\d{5}$/, example: "00100", hint: "5-digit CAP" },
  ES: { pattern: /^\d{5}$/, example: "28001", hint: "5-digit código postal" },
  NL: { pattern: /^\d{4}\s?[A-Z]{2}$/i, example: "1012 AB", hint: "Dutch postcode, e.g. 1012 AB" },
  BE: { pattern: /^\d{4}$/, example: "1000", hint: "4-digit Belgian postcode" },
  CH: { pattern: /^\d{4}$/, example: "8001", hint: "4-digit Swiss PLZ" },
  AT: { pattern: /^\d{4}$/, example: "1010", hint: "4-digit Austrian PLZ" },
  SE: { pattern: /^\d{3}\s?\d{2}$/, example: "111 22", hint: "Swedish postnummer, e.g. 111 22" },
  NO: { pattern: /^\d{4}$/, example: "0010", hint: "4-digit Norwegian postnummer" },
  DK: { pattern: /^\d{4}$/, example: "1050", hint: "4-digit Danish postnummer" },
  FI: { pattern: /^\d{5}$/, example: "00100", hint: "5-digit Finnish postinumero" },
  PL: { pattern: /^\d{2}-\d{3}$/, example: "00-001", hint: "Polish kod pocztowy, e.g. 00-001" },
  PT: { pattern: /^\d{4}-\d{3}$/, example: "1000-001", hint: "Portuguese código postal, e.g. 1000-001" },
  BR: { pattern: /^\d{5}-?\d{3}$/, example: "01310-100", hint: "CEP, 8 digits (optional hyphen)" },
  MX: { pattern: /^\d{5}$/, example: "01000", hint: "5-digit código postal" },
  JP: { pattern: /^\d{3}-?\d{4}$/, example: "100-0001", hint: "Japanese postcode, e.g. 100-0001" },
  CN: { pattern: /^\d{6}$/, example: "100000", hint: "6-digit postal code" },
  KR: { pattern: /^\d{5}$/, example: "03051", hint: "5-digit South Korean postcode" },
  SG: { pattern: /^\d{6}$/, example: "018956", hint: "6-digit Singapore postcode" },
  NZ: { pattern: /^\d{4}$/, example: "1010", hint: "4-digit New Zealand postcode" },
  IE: { pattern: /^[A-Z]\d{2}\s?[A-Z0-9]{4}$/i, example: "D02 AF30", hint: "Eircode, e.g. D02 AF30" },
  AE: { pattern: /^[A-Z0-9]{3,8}$/i, example: "00000", hint: "UAE postal / PO box code" },
  SA: { pattern: /^\d{5}(-\d{4})?$/, example: "11564", hint: "5-digit Saudi postal code" },
  PK: { pattern: /^\d{5}$/, example: "44000", hint: "5-digit Pakistani postal code" },
  BD: { pattern: /^\d{4}$/, example: "1000", hint: "4-digit Bangladeshi postcode" },
  NG: { pattern: /^\d{6}$/, example: "100001", hint: "6-digit Nigerian postcode" },
  ZA: { pattern: /^\d{4}$/, example: "0001", hint: "4-digit South African postcode" },
  PH: { pattern: /^\d{4}$/, example: "1000", hint: "4-digit Philippine ZIP" },
  TH: { pattern: /^\d{5}$/, example: "10100", hint: "5-digit Thai postcode" },
  MY: { pattern: /^\d{5}$/, example: "50000", hint: "5-digit Malaysian postcode" },
  ID: { pattern: /^\d{5}$/, example: "10110", hint: "5-digit Indonesian kode pos" },
  TR: { pattern: /^\d{5}$/, example: "06000", hint: "5-digit Turkish postcode" },
  GR: { pattern: /^\d{3}\s?\d{2}$/, example: "105 57", hint: "Greek ΤΚ, e.g. 105 57" },
};

function inRanges(value, ranges) {
  return (ranges || []).some(([min, max]) => value >= min && value <= max);
}

function countryMeta(countryIso) {
  const iso = String(countryIso || "").trim().toUpperCase();
  return COUNTRY_FORMAT[iso] || {
    pattern: /^[A-Z0-9][A-Z0-9 \-]{2,11}$/i,
    example: "12345",
    hint: "3–12 letter/number postal code",
  };
}

function postalRules(countryIso, stateIso) {
  const country = String(countryIso || "").trim().toUpperCase();
  const state = String(stateIso || "").trim().toUpperCase();
  const format = countryMeta(country);
  const rules = {
    countryIsoCode: country,
    stateIsoCode: state || null,
    example: format.example,
    hint: format.hint,
    pattern: format.pattern.source,
  };

  if (country === "US" && state && US_ZIP3[state]) {
    const ranges = US_ZIP3[state]
      .map(([a, b]) => (a === b ? String(a).padStart(3, "0") : `${String(a).padStart(3, "0")}–${String(b).padStart(3, "0")}`))
      .join(", ");
    rules.hint = `US ZIP for ${state}: 5 digits (optional +4). Prefix should be ${ranges}`;
  }
  if (country === "CA" && state && CA_FSA[state]) {
    rules.hint = `Canadian postal code for ${state}: first letter ${CA_FSA[state].join(" or ")} (e.g. ${format.example})`;
  }
  if (country === "AU" && state && AU_POST[state]) {
    rules.hint = `Australian postcode for ${state}: 4 digits in that state's range`;
  }
  return rules;
}

function assertPostalCode(countryIso, stateIso, zip) {
  const country = String(countryIso || "").trim().toUpperCase();
  const state = String(stateIso || "").trim().toUpperCase();
  const raw = String(zip || "").trim();
  if (!country) {
    throw httpError(400, "Country is required");
  }
  if (!raw) {
    throw httpError(400, "ZIP / postal code is required");
  }

  const format = countryMeta(country);
  if (!format.pattern.test(raw)) {
    throw httpError(400, `Invalid postal code for ${country}. ${format.hint}`);
  }

  if (country === "US") {
    const zip3 = Number.parseInt(raw.slice(0, 3), 10);
    if (state) {
      const ranges = US_ZIP3[state];
      if (ranges && !inRanges(zip3, ranges)) {
        throw httpError(400, `ZIP ${raw} does not belong to ${state}. ${postalRules(country, state).hint}`);
      }
    }
  }

  if (country === "CA") {
    const letter = raw.charAt(0).toUpperCase();
    if (state) {
      const letters = CA_FSA[state];
      if (letters && !letters.includes(letter)) {
        throw httpError(400, `Postal code ${raw} does not belong to ${state}. First letter should be ${letters.join(" or ")}.`);
      }
    }
  }

  if (country === "AU") {
    const num = Number.parseInt(raw, 10);
    if (state) {
      const ranges = AU_POST[state];
      if (ranges && !inRanges(num, ranges)) {
        throw httpError(400, `Postcode ${raw} does not belong to ${state}.`);
      }
    }
  }

  return raw;
}

module.exports = {
  assertPostalCode,
  postalRules,
  countryMeta,
};
