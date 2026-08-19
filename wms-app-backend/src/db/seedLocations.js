const { Country: CscCountry, State: CscState } = require("country-state-city");
const Country = require("../models/country");
const State = require("../models/state");
const logger = require("../config/logger");

function normalizePhoneCode(code) {
  const value = String(code || "").trim().replace(/^\+/, "");
  return value ? `+${value}` : "";
}

async function insertInBatches(Model, documents, batchSize = 500) {
  const inserted = [];

  for (let index = 0; index < documents.length; index += batchSize) {
    const batch = documents.slice(index, index + batchSize);
    try {
      const result = await Model.insertMany(batch, {
        ordered: false,
        throwOnValidationError: true,
      });
      inserted.push(...result);
    } catch (error) {
      if (Array.isArray(error.insertedDocs) && error.insertedDocs.length > 0) {
        inserted.push(...error.insertedDocs);
        continue;
      }
      throw error;
    }
  }

  return inserted;
}

function buildCountryDocs() {
  return CscCountry.getAllCountries()
    .map((country) => ({
      name: String(country.name || "").trim(),
      isoCode: String(country.isoCode || "").trim().toUpperCase(),
      currency: String(country.currency || "").trim().toUpperCase(),
      phoneCode: normalizePhoneCode(country.phonecode),
    }))
    .filter((country) => country.name && country.isoCode && country.currency && country.phoneCode);
}

function buildStateDocs(countryIdsByIso) {
  const uniqueStates = [];
  const seen = new Set();

  for (const state of CscState.getAllStates()) {
    const countryIsoCode = String(state.countryCode || "").trim().toUpperCase();
    const isoCode = String(state.isoCode || "").trim().toUpperCase();
    const name = String(state.name || "").trim();
    const countryId = countryIdsByIso.get(countryIsoCode);
    const key = `${countryIsoCode}:${isoCode}`;

    if (!countryId || !name || !isoCode || seen.has(key)) {
      continue;
    }

    seen.add(key);
    uniqueStates.push({
      name,
      isoCode,
      countryId,
      countryIsoCode,
    });
  }

  return uniqueStates;
}

async function seedCountriesAndStates() {
  let countries = await Country.find().select("_id isoCode").lean();

  if (countries.length === 0) {
    countries = await insertInBatches(Country, buildCountryDocs());
  }

  const countryIdsByIso = new Map(
    countries
      .map((country) => [String(country.isoCode || "").toUpperCase(), country._id])
      .filter(([isoCode]) => isoCode)
  );

  const existingStates = await State.countDocuments();

  if (existingStates === 0) {
    const stateDocs = buildStateDocs(countryIdsByIso);
    if (stateDocs.length === 0) {
      throw new Error("Country/state seed produced 0 states");
    }
    await insertInBatches(State, stateDocs);
  }

  const [countryCount, stateCount] = await Promise.all([
    Country.countDocuments(),
    State.countDocuments(),
  ]);

  logger.info({ countries: countryCount, states: stateCount }, "Countries and states ready");
}

module.exports = {
  seedCountriesAndStates,
};
