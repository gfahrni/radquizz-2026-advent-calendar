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

  var caseItem = form.addTextItem()
    .setTitle('Case (prefilled — do not edit)')
    .setRequired(false);

  var pidItem = form.addTextItem()
    .setTitle('Participant ID (prefilled — do not edit)')
    .setRequired(false);

  // The embedded URL uses the *published* id (1FAIpQLS…), not the edit-file id.
  var published = form.getPublishedUrl();          // …/forms/d/e/<ID>/viewform
  var formId = published.split('/d/e/')[1].split('/')[0];

  var config = {
    formId: formId,
    entries: {
      case: 'entry.' + caseItem.getId(),
      participant: 'entry.' + pidItem.getId()
    }
  };

  Logger.log('Edit:     ' + form.getEditUrl());
  Logger.log('Respond:  ' + published);
  Logger.log('');
  Logger.log('--- copy this into content/form.json ---');
  Logger.log(JSON.stringify(config, null, 2));
  Logger.log('----------------------------------------');

  return config;
}
