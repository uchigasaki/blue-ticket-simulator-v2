// Google Apps Script backend for the Bicycle Blue Ticket Simulator.
// Deploy this as a Web App and paste the Web App URL into config.js.

const SPREADSHEET_ID = ""; // Leave blank when this script is bound to the target spreadsheet.
const ADMIN_EMAIL = ""; // Optional: receive a short notification for each main submission.
const FALLBACK_FOLLOW_UP_URL = ""; // Optional: https://uchigasaki.github.io/blue-ticket-simulator/followup.html
const FOLLOW_UP_DELAY_DAYS = 7;
const FOLLOW_UP_FORM_ID_PROPERTY = "FOLLOW_UP_FORM_ID";

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const payload = JSON.parse(e.postData.contents || "{}");
    const eventType = payload.event_type || "unknown";
    appendObject_("raw_log", {
      received_at: new Date().toISOString(),
      event_type: eventType,
      participant_id: value_(payload, "session.participant_id"),
      session_id: value_(payload, "session.session_id"),
      json: JSON.stringify(payload)
    });

    if (eventType === "follow_up") {
      saveFollowUp_(payload);
    } else {
      saveMainSubmission_(payload);
    }

    return ContentService
      .createTextOutput(JSON.stringify({ok: true}))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    appendObject_("errors", {
      received_at: new Date().toISOString(),
      message: String(err && err.stack ? err.stack : err)
    });
    return ContentService
      .createTextOutput(JSON.stringify({ok: false, error: String(err)}))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}

function saveMainSubmission_(payload) {
  const session = payload.session || {};
  const result = payload.result || {};
  const pre = payload.pre_survey || {};
  const post = payload.post_survey || {};
  const row = {
    submitted_at: payload.submitted_at || new Date().toISOString(),
    participant_id: session.participant_id || "",
    session_id: session.session_id || "",
    email: session.email || "",
    language: session.language || "",
    consent: session.consent || "",
    started_at: session.started_at || "",
    simulation_completed_at: session.simulation_completed_at || "",
    post_survey_completed_at: session.post_survey_completed_at || "",
    diagnosis: result.diagnosis || "",
    score: result.score || "",
    total: result.total || "",
    percent: result.percent || "",
    strongest_category: result.strongest_category || "",
    weakest_category: result.weakest_category || "",
    follow_up_requested: value_(payload, "follow_up.requested"),
    follow_up_url: value_(payload, "follow_up.url")
  };
  Object.keys(pre).forEach(function(key){ row["pre_" + key] = stringify_(pre[key]); });
  Object.keys(post).forEach(function(key){ row["post_" + key] = stringify_(post[key]); });
  const categories = result.categories || {};
  Object.keys(categories).forEach(function(key){
    row["category_" + key] = stringify_(categories[key]);
  });
  appendObject_("main_responses", row);

  (payload.answers || []).forEach(function(answer, index){
    appendObject_("question_answers", {
      submitted_at: payload.submitted_at || new Date().toISOString(),
      participant_id: session.participant_id || "",
      session_id: session.session_id || "",
      answer_index: index + 1,
      question_id: answer.question_id || "",
      selected_answer: answer.selected_answer || "",
      correct_answer: answer.correct_answer || "",
      is_correct: answer.is_correct,
      question_started_at: answer.question_started_at || "",
      answered_at: answer.answered_at || "",
      response_time_ms: answer.response_time_ms || ""
    });
  });

  if (session.email) {
    queueFollowUp_(payload);
  }
  if (ADMIN_EMAIL) {
    MailApp.sendEmail({
      to: ADMIN_EMAIL,
      subject: "[Blue Ticket Simulator] New response: " + (session.participant_id || ""),
      body: "A new response was saved.\n\nParticipant ID: " + (session.participant_id || "") +
        "\nSession ID: " + (session.session_id || "") +
        "\nScore: " + (result.score || "") + "/" + (result.total || "")
    });
  }
}

function saveFollowUp_(payload) {
  const session = payload.session || {};
  const survey = payload.follow_up_survey || {};
  const row = {
    submitted_at: payload.submitted_at || new Date().toISOString(),
    participant_id: session.participant_id || "",
    session_id: session.session_id || "",
    language: session.language || ""
  };
  Object.keys(survey).forEach(function(key){ row[key] = stringify_(survey[key]); });
  appendObject_("follow_up_responses", row);
}

function queueFollowUp_(payload) {
  const session = payload.session || {};
  const due = new Date();
  due.setDate(due.getDate() + FOLLOW_UP_DELAY_DAYS);
  const url = value_(payload, "follow_up.url") || buildFollowUpUrl_(session);
  appendObject_("email_queue", {
    queued_at: new Date().toISOString(),
    due_at: due.toISOString(),
    status: url ? "queued" : "missing_url",
    email: session.email || "",
    participant_id: session.participant_id || "",
    session_id: session.session_id || "",
    language: session.language || "ja",
    follow_up_url: url
  });
}

function sendDueFollowUps() {
  const sheet = getSheet_("email_queue");
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return;
  const headers = values[0];
  const now = new Date();
  const statusCol = headers.indexOf("status") + 1;
  const sentAtCol = ensureHeader_(sheet, headers, "sent_at");
  const errorCol = ensureHeader_(sheet, headers, "error");
  const currentHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

  for (var r = 2; r <= sheet.getLastRow(); r++) {
    const row = rowObject_(currentHeaders, sheet.getRange(r, 1, 1, sheet.getLastColumn()).getValues()[0]);
    if (row.status !== "queued") continue;
    if (!row.email || !row.due_at || new Date(row.due_at) > now) continue;
    try {
      sendFollowUpEmail_(row);
      sheet.getRange(r, statusCol).setValue("sent");
      sheet.getRange(r, sentAtCol).setValue(new Date().toISOString());
      sheet.getRange(r, errorCol).setValue("");
    } catch (err) {
      sheet.getRange(r, statusCol).setValue("error");
      sheet.getRange(r, errorCol).setValue(String(err));
    }
  }
}

function sendFollowUpEmail_(row) {
  const subject = row.language === "en"
    ? "One-week follow-up survey: Bicycle Blue Ticket Rule Check"
    : "【1週間後アンケート】自転車青切符ルール診断";
  const body = row.language === "en"
    ? "Thank you for participating in the Bicycle Blue Ticket Rule Check.\n\nParticipant ID: " + row.participant_id +
      "\nPlease answer the one-week follow-up survey here:\n" + row.follow_up_url +
      "\n\nPlease use the same participant ID so the responses can be matched for research."
    : "自転車青切符ルール診断へのご協力ありがとうございました。\n\n参加者ID: " + row.participant_id +
      "\n1週間後アンケートはこちらから回答してください。\n" + row.follow_up_url +
      "\n\n研究上の対応付けのため，回答時も同じ参加者IDを使用してください。";
  MailApp.sendEmail({to: row.email, subject: subject, body: body});
}

function installDailyTrigger() {
  ScriptApp.newTrigger("sendDueFollowUps")
    .timeBased()
    .everyDays(1)
    .atHour(9)
    .create();
}

function buildFollowUpUrl_(session) {
  const formUrl = buildGoogleFormPrefillUrl_(session);
  if (formUrl) return formUrl;
  if (!FALLBACK_FOLLOW_UP_URL) return "";
  const query = "?pid=" + encodeURIComponent(session.participant_id || "") +
    "&sid=" + encodeURIComponent(session.session_id || "") +
    "&lang=" + encodeURIComponent(session.language || "ja");
  return FALLBACK_FOLLOW_UP_URL + query;
}

function createFollowUpGoogleForm() {
  const book = getBook_();
  const form = FormApp.create("自転車青切符ルール診断 1週間後アンケート");
  form.setDescription("自転車青切符ルール診断を体験してから1週間後の記憶・意識・行動変化を確認する研究用アンケートです。");
  form.setCollectEmail(false);
  form.setDestination(FormApp.DestinationType.SPREADSHEET, book.getId());

  form.addTextItem()
    .setTitle("参加者ID")
    .setHelpText("診断時と同じIDを入力してください。")
    .setRequired(true);
  form.addTextItem()
    .setTitle("セッションID")
    .setHelpText("メール内URLから開いた場合は自動入力されます。")
    .setRequired(true);

  const scaleTitles = [
    "体験から1週間後でも，青切符の対象になりうる行動を思い出せると思いますか。",
    "実際の場面で，違反や危険につながる行動を以前より判断しやすくなったと思いますか。",
    "この1週間で，自転車に乗るときの行動を見直した場面がありましたか。",
    "自転車の交通ルールや青切符制度について，家族・友人・周囲の人と話すきっかけになりましたか。",
    "今後も，自転車の交通ルールを確認したいと思いますか。"
  ];
  scaleTitles.forEach(function(title) {
    form.addMultipleChoiceItem()
      .setTitle(title)
      .setChoiceValues(["1 まったくそう思わない", "2 あまりそう思わない", "3 ややそう思う", "4 とてもそう思う"])
      .setRequired(true);
  });
  form.addParagraphTextItem()
    .setTitle("この1週間で気づいたこと，覚えていたこと，行動が変わったことがあれば自由に記入してください。")
    .setRequired(false);

  PropertiesService.getScriptProperties().setProperty(FOLLOW_UP_FORM_ID_PROPERTY, form.getId());
  appendObject_("setup_log", {
    created_at: new Date().toISOString(),
    type: "follow_up_google_form",
    form_id: form.getId(),
    edit_url: form.getEditUrl(),
    published_url: form.getPublishedUrl()
  });
  Logger.log("Follow-up Google Form edit URL: " + form.getEditUrl());
  Logger.log("Follow-up Google Form published URL: " + form.getPublishedUrl());
}

function buildGoogleFormPrefillUrl_(session) {
  const formId = PropertiesService.getScriptProperties().getProperty(FOLLOW_UP_FORM_ID_PROPERTY);
  if (!formId) return "";
  const form = FormApp.openById(formId);
  const items = form.getItems();
  const participantItem = findItemByTitle_(items, "参加者ID");
  const sessionItem = findItemByTitle_(items, "セッションID");
  if (!participantItem || !sessionItem) return form.getPublishedUrl();
  const response = form.createResponse();
  response.withItemResponse(participantItem.asTextItem().createResponse(session.participant_id || ""));
  response.withItemResponse(sessionItem.asTextItem().createResponse(session.session_id || ""));
  return response.toPrefilledUrl();
}

function findItemByTitle_(items, title) {
  for (var i = 0; i < items.length; i++) {
    if (items[i].getTitle() === title) return items[i];
  }
  return null;
}

function appendObject_(sheetName, obj) {
  const sheet = getSheet_(sheetName);
  const headers = getHeaders_(sheet);
  Object.keys(obj).forEach(function(key){
    if (headers.indexOf(key) === -1) {
      sheet.getRange(1, headers.length + 1).setValue(key);
      headers.push(key);
    }
  });
  const row = headers.map(function(key){ return stringify_(obj[key]); });
  sheet.appendRow(row);
}

function getBook_() {
  return SPREADSHEET_ID
    ? SpreadsheetApp.openById(SPREADSHEET_ID)
    : SpreadsheetApp.getActiveSpreadsheet();
}

function getSheet_(name) {
  const book = getBook_();
  return book.getSheetByName(name) || book.insertSheet(name);
}

function getHeaders_(sheet) {
  if (sheet.getLastRow() === 0 || sheet.getLastColumn() === 0) return [];
  return sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].filter(String);
}

function ensureHeader_(sheet, headers, key) {
  var index = headers.indexOf(key);
  if (index !== -1) return index + 1;
  sheet.getRange(1, headers.length + 1).setValue(key);
  headers.push(key);
  return headers.length;
}

function rowObject_(headers, values) {
  const obj = {};
  headers.forEach(function(key, index){ obj[key] = values[index]; });
  return obj;
}

function value_(obj, path) {
  return path.split(".").reduce(function(current, key){
    return current && current[key] !== undefined ? current[key] : "";
  }, obj);
}

function stringify_(value) {
  if (value === undefined || value === null) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return value;
}
