/**
 * RadQuizz — creates the answer form for the advent calendar.
 *
 * 1. Open https://script.google.com and click "New project".
 * 2. Delete the default code, paste this whole file.
 * 3. Click Run (authorise it the first time).
 * 4. Open "Execution log" at the bottom and copy the JSON block.
 * 5. Paste that JSON into content/form.json of the project.
 *
 * Then, in the form: Responses -> Link to Sheets.
 *
 * Note: FormApp only exposes *question* ids, not the entry ids used by
 * prefilled links. entryIdsFor() reads the published form and maps the
 * question titles to their real entry ids.
 */
function createRadQuizzForm() {
  var form = FormApp.create('RadQuizz — Advent Calendar 2026');
  form.setDescription('One diagnosis, then your details. It takes about two minutes.');
  form.setCollectEmail(false);

  form.addParagraphTextItem().setTitle('Diagnosis').setRequired(true);

  form.addTextItem().setTitle('Name').setRequired(true);

  form.addTextItem().setTitle('Email').setRequired(true)
    .setValidation(FormApp.createTextValidation().requireTextIsEmail().build());

  form.addMultipleChoiceItem().setTitle('Status')
    .setChoiceValues(['Junior', 'Senior'])
    .setRequired(true);

  var caseTitle = 'Case (prefilled — do not edit)';
  var pidTitle = 'Participant ID (prefilled — do not edit)';

  form.addTextItem().setTitle(caseTitle).setRequired(false);
  form.addTextItem().setTitle(pidTitle).setRequired(false);

  var ids = entryIdsFor(form);
  var config = {
    formId: publishedId(form),
    entries: {
      case: ids[caseTitle],
      participant: ids[pidTitle]
    }
  };

  if (!config.entries.case || !config.entries.participant) {
    Logger.log('⚠ Could not read the entry ids automatically.');
    Logger.log('  Use the form editor: ⋮ → Get pre-filled link.');
  }

  Logger.log('Edit:     ' + form.getEditUrl());
  Logger.log('Respond:  ' + form.getPublishedUrl());
  Logger.log('');
  Logger.log('--- copy this into content/form.json ---');
  Logger.log(JSON.stringify(config, null, 2));
  Logger.log('----------------------------------------');

  return config;
}

/** The embedded URL uses the published id (1FAIpQLS…), not the file id. */
function publishedId(form) {
  return form.getPublishedUrl().split('/d/e/')[1].split('/')[0];
}

/**
 * Map question titles to their entry ids, by reading the published form.
 * Returns { 'Question title': 'entry.123456789', … }
 */
function entryIdsFor(form) {
  var html = UrlFetchApp.fetch(form.getPublishedUrl(),
    { muteHttpExceptions: true }).getContentText();
  var out = {};
  var re = /data-params="(%.@\.\[.*?)"/g;
  var m;
  while ((m = re.exec(html)) !== null) {
    var raw = m[1].replace(/&quot;/g, '"');
    var q = raw.match(/^%\.@\.\[(\d+),"([^"]*)"/);
    var e = raw.match(/\[\[(\d+)/);
    if (q && e) out[q[2]] = 'entry.' + e[1];
  }
  return out;
}
