const { Test } = require('../models');

async function syncTestHasExplanations(testId, value) {
  if (testId == null || testId === '') return;
  const test = await Test.findByPk(testId);
  if (!test) return;
  test.hasExplanations = Boolean(value);
  await test.save();
}

module.exports = { syncTestHasExplanations };
