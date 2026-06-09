"use strict";

const SPREADSHEET_ID = "1qoNyC0PmKu7-ZWqshUPZYD67xHvLcQgmqFRwxsGJ7rM";
const SPREADSHEET_CALLBACK = "receiveSpreadsheetData";
const SPREADSHEET_URL =
  `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}` +
  `/gviz/tq?tqx=out:json;responseHandler:${SPREADSHEET_CALLBACK}`;
const LOAD_TIMEOUT_MS = 15000;
const AUTO_REFRESH_MS = 30000;

const STORAGE_KEY = "successPathShuffleState";

const memberIdElement = document.getElementById("memberId");
const adNameElement = document.getElementById("adName");
const sequenceCounterElement = document.getElementById("sequenceCounter");
const progressFillElement = document.getElementById("progressFill");
const statusTextElement = document.getElementById("statusText");
const nextButton = document.getElementById("nextButton");
const resetButton = document.getElementById("resetButton");

let adsData = [];
let shuffledAdKeys = [];
let currentPosition = 0;
let loadTimeoutId;
let isInitialLoad = true;

function getAdKey(ad) {
  return `${ad.memberId}\u001f${ad.url}`;
}

function shuffleArray(items) {
  const shuffledItems = [...items];

  for (let index = shuffledItems.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [shuffledItems[index], shuffledItems[randomIndex]] = [
      shuffledItems[randomIndex],
      shuffledItems[index]
    ];
  }

  return shuffledItems;
}

function createShuffledOrder(previousAdKey = "") {
  const adKeys = adsData.map(getAdKey);
  const shuffledKeys = shuffleArray(adKeys);

  if (
    shuffledKeys.length > 1 &&
    previousAdKey &&
    shuffledKeys[0] === previousAdKey
  ) {
    const swapIndex = 1 + Math.floor(Math.random() * (shuffledKeys.length - 1));
    [shuffledKeys[0], shuffledKeys[swapIndex]] = [
      shuffledKeys[swapIndex],
      shuffledKeys[0]
    ];
  }

  return shuffledKeys;
}

function getSavedShuffleState() {
  try {
    const savedState = JSON.parse(localStorage.getItem(STORAGE_KEY));

    if (!Array.isArray(savedState?.order)) {
      return null;
    }

    return {
      order: savedState.order.filter((key) => typeof key === "string"),
      position: Number.isInteger(savedState.position)
        ? savedState.position
        : 0
    };
  } catch {
    return null;
  }
}

function saveShuffleState() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      order: shuffledAdKeys,
      position: currentPosition
    })
  );
}

function reconcileShuffleState(savedState = null) {
  const availableAdKeys = adsData.map(getAdKey);
  const availableAdKeySet = new Set(availableAdKeys);
  const sourceOrder = savedState?.order || shuffledAdKeys;
  const sourcePosition = savedState?.position ?? currentPosition;
  const currentAdKey = sourceOrder[sourcePosition];
  const retainedKeys = sourceOrder.filter(
    (key, index) =>
      availableAdKeySet.has(key) && sourceOrder.indexOf(key) === index
  );
  const retainedKeySet = new Set(retainedKeys);
  const newKeys = shuffleArray(
    availableAdKeys.filter((key) => !retainedKeySet.has(key))
  );

  shuffledAdKeys = [...retainedKeys, ...newKeys];
  currentPosition = shuffledAdKeys.indexOf(currentAdKey);

  if (currentPosition < 0) {
    currentPosition = 0;
  }

  saveShuffleState();
}

function getCurrentAd() {
  const currentAdKey = shuffledAdKeys[currentPosition];
  return adsData.find((ad) => getAdKey(ad) === currentAdKey);
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

  const currentAd = getCurrentAd();

  if (!currentAd) {
    reconcileShuffleState();
    displayCurrentAd();
    return;
  }

  const progressPercentage =
    ((currentPosition + 1) / shuffledAdKeys.length) * 100;

  memberIdElement.textContent = currentAd.memberId || "Unknown member";
  adNameElement.textContent = currentAd.adName || "Unnamed opportunity";
  sequenceCounterElement.textContent =
    `${currentPosition + 1} / ${shuffledAdKeys.length}`;
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

  adsData = updatedAdsData;

  if (isInitialLoad) {
    reconcileShuffleState(getSavedShuffleState());
    isInitialLoad = false;
  } else {
    reconcileShuffleState();
  }

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

  const currentAd = getCurrentAd();

  if (!currentAd || !isValidUrl(currentAd.url)) {
    setStatus("This opportunity does not have a valid URL.", true);
    return;
  }

  window.open(currentAd.url, "_blank", "noopener,noreferrer");

  if (currentPosition >= shuffledAdKeys.length - 1) {
    shuffledAdKeys = createShuffledOrder(getAdKey(currentAd));
    currentPosition = 0;
  } else {
    currentPosition += 1;
  }

  saveShuffleState();
  displayCurrentAd();
}

function resetSequence() {
  if (adsData.length === 0) {
    setStatus("No advertising data available.", true);
    return;
  }

  const currentAd = getCurrentAd();
  const currentAdKey = currentAd ? getAdKey(currentAd) : "";
  shuffledAdKeys = createShuffledOrder(currentAdKey);
  currentPosition = 0;
  saveShuffleState();
  displayCurrentAd();
  setStatus("Sequence reset. A new fair rotation has started.");
}

nextButton.addEventListener("click", openCurrentAd);
resetButton.addEventListener("click", resetSequence);

window[SPREADSHEET_CALLBACK] = receiveSpreadsheetData;
loadSpreadsheetData(true);
window.setInterval(loadSpreadsheetData, AUTO_REFRESH_MS);
