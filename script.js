"use strict";

const SPREADSHEET_ID = "1qoNyC0PmKu7-ZWqshUPZYD67xHvLcQgmqFRwxsGJ7rM";
const SPREADSHEET_CALLBACK = "receiveSpreadsheetData";
const SPREADSHEET_URL =
  `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}` +
  `/gviz/tq?tqx=out:json;responseHandler:${SPREADSHEET_CALLBACK}`;
const LOAD_TIMEOUT_MS = 15000;
const AUTO_REFRESH_MS = 30000;

const STORAGE_KEY = "successPathSequencePosition";

const memberIdElement = document.getElementById("memberId");
const adNameElement = document.getElementById("adName");
const sequenceCounterElement = document.getElementById("sequenceCounter");
const progressFillElement = document.getElementById("progressFill");
const statusTextElement = document.getElementById("statusText");
const nextButton = document.getElementById("nextButton");
const resetButton = document.getElementById("resetButton");

let adsData = [];
let currentIndex = 0;
let loadTimeoutId;
let isInitialLoad = true;

function getSavedIndex() {
  const savedIndex = Number.parseInt(localStorage.getItem(STORAGE_KEY), 10);
  const isValidIndex =
    Number.isInteger(savedIndex) &&
    savedIndex >= 0 &&
    savedIndex < adsData.length;

  return isValidIndex ? savedIndex : 0;
}

function setStatus(message, isError = false) {
  statusTextElement.textContent = message;
  statusTextElement.classList.toggle("error", isError);
}

function displayCurrentAd() {
  if (adsData.length === 0) {
    memberIdElement.textContent = "Unavailable";
    adNameElement.textContent = "No advertising data available.";
    sequenceCounterElement.textContent = "0 / 0";
    progressFillElement.style.width = "0%";
    nextButton.disabled = true;
    setStatus("No advertising data available.", true);
    return;
  }

  const currentAd = adsData[currentIndex];
  const progressPercentage = ((currentIndex + 1) / adsData.length) * 100;

  memberIdElement.textContent = currentAd.memberId || "Unknown member";
  adNameElement.textContent = currentAd.adName || "Unnamed opportunity";
  sequenceCounterElement.textContent = `${currentIndex + 1} / ${adsData.length}`;
  progressFillElement.style.width = `${progressPercentage}%`;
  nextButton.disabled = false;
  setStatus("Click NEXT to continue your success journey.");
}

function getCellValue(cell) {
  if (!cell || cell.v === null || cell.v === undefined) {
    return "";
  }

  return String(cell.v).trim();
}

function parseSpreadsheetResponse(response) {
  const rows = response?.table?.rows;

  if (response?.status !== "ok" || !Array.isArray(rows) || rows.length < 2) {
    return [];
  }

  const headers = rows[0].c.map(getCellValue);
  const memberIdIndex = headers.indexOf("memberId");
  const adNameIndex = headers.indexOf("adName");
  const urlIndex = headers.indexOf("url");

  if (memberIdIndex === -1 || adNameIndex === -1 || urlIndex === -1) {
    return [];
  }

  return rows
    .slice(1)
    .map((row) => ({
      memberId: getCellValue(row.c?.[memberIdIndex]),
      adName: getCellValue(row.c?.[adNameIndex]),
      url: getCellValue(row.c?.[urlIndex])
    }))
    .filter((ad) => ad.memberId || ad.adName || ad.url);
}

function showDataError(message) {
  adsData = [];
  displayCurrentAd();
  adNameElement.textContent = message;
  setStatus(message, true);
}

function receiveSpreadsheetData(response) {
  window.clearTimeout(loadTimeoutId);
  const updatedAdsData = parseSpreadsheetResponse(response);

  if (updatedAdsData.length === 0) {
    if (isInitialLoad) {
      showDataError("No advertising data available.");
    }
    return;
  }

  const currentMemberId = adsData[currentIndex]?.memberId;
  adsData = updatedAdsData;

  if (isInitialLoad) {
    currentIndex = getSavedIndex();
    isInitialLoad = false;
  } else {
    const updatedIndex = adsData.findIndex(
      (ad) => ad.memberId === currentMemberId
    );

    currentIndex = updatedIndex >= 0 ? updatedIndex : getSavedIndex();
  }

  localStorage.setItem(STORAGE_KEY, String(currentIndex));
  displayCurrentAd();
}

function loadSpreadsheetData(showLoadingState = false) {
  if (showLoadingState) {
    nextButton.disabled = true;
    resetButton.disabled = true;
  }

  const scriptElement = document.createElement("script");
  scriptElement.src = `${SPREADSHEET_URL}&cacheBust=${Date.now()}`;
  scriptElement.async = true;

  scriptElement.addEventListener("load", () => {
    scriptElement.remove();
    resetButton.disabled = false;
  });

  scriptElement.addEventListener("error", () => {
    window.clearTimeout(loadTimeoutId);
    scriptElement.remove();
    resetButton.disabled = false;

    if (isInitialLoad) {
      showDataError("Unable to load advertising data.");
    }
  });

  loadTimeoutId = window.setTimeout(() => {
    scriptElement.remove();
    resetButton.disabled = false;

    if (isInitialLoad) {
      showDataError("Advertising data request timed out.");
    }
  }, LOAD_TIMEOUT_MS);

  document.head.appendChild(scriptElement);
}

function isValidUrl(url) {
  if (typeof url !== "string" || url.trim() === "") {
    return false;
  }

  try {
    const parsedUrl = new URL(url);
    return parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:";
  } catch {
    return false;
  }
}

function openCurrentAd() {
  if (adsData.length === 0) {
    setStatus("No advertising data available.", true);
    return;
  }

  const currentAd = adsData[currentIndex];

  if (!isValidUrl(currentAd.url)) {
    setStatus("This opportunity does not have a valid URL.", true);
    return;
  }

  window.open(currentAd.url, "_blank", "noopener,noreferrer");

  currentIndex = (currentIndex + 1) % adsData.length;
  localStorage.setItem(STORAGE_KEY, String(currentIndex));
  displayCurrentAd();
}

function resetSequence() {
  if (adsData.length === 0) {
    setStatus("No advertising data available.", true);
    return;
  }

  currentIndex = 0;
  localStorage.setItem(STORAGE_KEY, String(currentIndex));
  displayCurrentAd();
  setStatus("Sequence reset. Your journey starts from the first opportunity.");
}

nextButton.addEventListener("click", openCurrentAd);
resetButton.addEventListener("click", resetSequence);

window[SPREADSHEET_CALLBACK] = receiveSpreadsheetData;
loadSpreadsheetData(true);
window.setInterval(loadSpreadsheetData, AUTO_REFRESH_MS);
