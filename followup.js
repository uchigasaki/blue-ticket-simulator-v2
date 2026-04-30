const CONFIG = window.APP_CONFIG || {};
const params = new URLSearchParams(location.search);
const lang = params.get("lang") === "en" ? "en" : "ja";
document.documentElement.lang = lang;

const app = document.getElementById("app");
const labels = {
  ja: ["まったくそう思わない", "あまりそう思わない", "ややそう思う", "とてもそう思う"],
  en: ["Strongly disagree", "Somewhat disagree", "Somewhat agree", "Strongly agree"]
};
const text = {
  ja: {
    title: "1週間後アンケート",
    subtitle: "自転車青切符ルール診断の体験後に，記憶・意識・行動の変化を確認します。",
    participant: "参加者ID",
    session: "セッションID",
    required: "この項目に回答してください。",
    send: "送信する",
    csv: "CSVを保存",
    sent: "回答を送信しました。ご協力ありがとうございました。",
    skipped: "Google Sheets連携URLが未設定です。CSVを保存してください。",
    failed: "自動送信に失敗しました。CSVを保存してください。"
  },
  en: {
    title: "One-week Follow-up Survey",
    subtitle: "This survey checks memory, awareness, and behavior changes after using the Bicycle Blue Ticket Rule Check.",
    participant: "Participant ID",
    session: "Session ID",
    required: "Please answer this item.",
    send: "Submit",
    csv: "Save CSV",
    sent: "Your answer was sent. Thank you.",
    skipped: "Google Sheets integration URL is not configured. Please save the CSV.",
    failed: "Automatic submission failed. Please save the CSV."
  }
};
const items = {
  ja: [
    {id:"remembered_rules", title:"体験から1週間後でも，青切符の対象になりうる行動を思い出せると思いますか。"},
    {id:"judgment_retention", title:"実際の場面で，違反や危険につながる行動を以前より判断しやすくなったと思いますか。"},
    {id:"behavior_change", title:"この1週間で，自転車に乗るときの行動を見直した場面がありましたか。"},
    {id:"conversation", title:"自転車の交通ルールや青切符制度について，家族・友人・周囲の人と話すきっかけになりましたか。"},
    {id:"continued_interest", title:"今後も，自転車の交通ルールを確認したいと思いますか。"}
  ],
  en: [
    {id:"remembered_rules", title:"One week after the experience, do you think you can still remember actions that may lead to blue tickets?"},
    {id:"judgment_retention", title:"Do you think it became easier to judge actions that may become violations or dangers in real situations?"},
    {id:"behavior_change", title:"During the past week, did you review your behavior when riding a bicycle?"},
    {id:"conversation", title:"Did this experience become a reason to talk with family, friends, or others about bicycle rules or the blue ticket system?"},
    {id:"continued_interest", title:"Do you want to continue checking bicycle traffic rules in the future?"}
  ]
};
const state = {
  participantId: params.get("pid") || "",
  sessionId: params.get("sid") || "",
  answers: {},
  freeText: "",
  status: "idle",
  message: ""
};

function escapeHtml(str){
  return String(str ?? "").replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}
function csvEscape(v){
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s;
}
function layout(content){
  return `<main class="site">
    <header class="header">
      <div class="brand"><h1>${escapeHtml(text[lang].title)}</h1><p>${escapeHtml(text[lang].subtitle)}</p></div>
      <div class="badge">Follow-up</div>
    </header>
    ${content}
    <div class="footer-note">Research prototype</div>
  </main>`;
}
function render(){
  const fields = items[lang].map((item,idx)=>`
    <div class="card">
      <div class="theme">Q${idx+1}</div>
      <h2 class="title">${escapeHtml(item.title)}</h2>
      <div class="scale">
        <div class="scale-options">${[1,2,3,4].map(n=>`<label><input type="radio" name="${item.id}" value="${n}" ${String(state.answers[item.id])===String(n)?"checked":""}><span>${n}</span><small>${escapeHtml(labels[lang][n-1])}</small></label>`).join("")}</div>
      </div>
    </div>`).join("");
  const statusClass = state.status === "sent" ? "good" : state.status === "failed" ? "bad" : "muted";
  app.innerHTML = layout(`
    <section class="card">
      <h2 class="title">${escapeHtml(text[lang].participant)}</h2>
      <input id="participant" class="input" value="${escapeHtml(state.participantId)}" placeholder="BIKE33" />
      <h2 class="title" style="margin-top:18px">${escapeHtml(text[lang].session)}</h2>
      <input id="session" class="input" value="${escapeHtml(state.sessionId)}" />
      ${state.message ? `<p class="save-status ${statusClass}">${escapeHtml(state.message)}</p>` : ""}
    </section>
    <form id="followForm">
      ${fields}
      <div class="card">
        <div class="theme">Free text</div>
        <h2 class="title">${lang === "ja" ? "この1週間で気づいたこと，覚えていたこと，行動が変わったことがあれば自由に記入してください。" : "Please write anything you noticed, remembered, or changed during the past week."}</h2>
        <textarea class="textarea" name="free_text">${escapeHtml(state.freeText)}</textarea>
      </div>
      <div class="row card"><button type="submit" class="btn">${escapeHtml(text[lang].send)}</button><button type="button" class="btn secondary" onclick="downloadCsv()">${escapeHtml(text[lang].csv)}</button></div>
    </form>
  `);
  document.getElementById("followForm").addEventListener("submit", submitFollowup);
}
function collect(formElement){
  const form = new FormData(formElement);
  state.participantId = document.getElementById("participant").value.trim();
  state.sessionId = document.getElementById("session").value.trim();
  if(!state.participantId || !state.sessionId){
    state.status = "failed";
    state.message = text[lang].required;
    return false;
  }
  for(const item of items[lang]){
    const value = form.get(item.id);
    if(!value){
      state.status = "failed";
      state.message = text[lang].required;
      return false;
    }
    state.answers[item.id] = value;
  }
  state.freeText = form.get("free_text") || "";
  return true;
}
function payload(){
  return {
    event_type: "follow_up",
    submitted_at: new Date().toISOString(),
    session: {
      participant_id: state.participantId,
      session_id: state.sessionId,
      language: lang
    },
    follow_up_survey: {...state.answers, free_text: state.freeText},
    user_agent: navigator.userAgent
  };
}
async function submitFollowup(e){
  e.preventDefault();
  if(!collect(e.target)) return render();
  if(!CONFIG.GOOGLE_SCRIPT_URL){
    state.status = "skipped";
    state.message = text[lang].skipped;
    return render();
  }
  try{
    await fetch(CONFIG.GOOGLE_SCRIPT_URL, {
      method: "POST",
      mode: "no-cors",
      headers: {"Content-Type": "text/plain;charset=utf-8"},
      body: JSON.stringify(payload())
    });
    state.status = "sent";
    state.message = text[lang].sent;
  }catch(err){
    state.status = "failed";
    state.message = text[lang].failed;
  }
  render();
}
function downloadCsv(){
  const data = payload();
  const rows = [["section","key","value"]];
  rows.push(["session","participant_id",data.session.participant_id]);
  rows.push(["session","session_id",data.session.session_id]);
  rows.push(["session","language",data.session.language]);
  rows.push(["session","submitted_at",data.submitted_at]);
  for(const [k,v] of Object.entries(data.follow_up_survey)) rows.push(["follow_up",k,v]);
  const csv = "\ufeff" + rows.map(row => row.map(csvEscape).join(",")).join("\n");
  const blob = new Blob([csv], {type:"text/csv;charset=utf-8"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${state.participantId || "participant"}_followup_${new Date().toISOString().replace(/[:.]/g,"-")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

render();
