class ParsedUsmleQuestion {
  const ParsedUsmleQuestion({
    required this.isLinked,
    required this.questionText,
    this.vignette,
  });

  final bool isLinked;
  final String? vignette;
  final String questionText;
}

const _vignetteMarker = '<<<USMLE_VIGNETTE>>>';
const _questionMarker = '<<<USMLE_QUESTION>>>';

ParsedUsmleQuestion parseUsmleQuestionText(String? text) {
  final raw = text ?? '';
  final vignetteIdx = raw.indexOf(_vignetteMarker);
  final questionIdx = raw.indexOf(_questionMarker);

  if (vignetteIdx == -1 || questionIdx == -1 || questionIdx < vignetteIdx) {
    return ParsedUsmleQuestion(
      isLinked: false,
      questionText: raw.trim(),
    );
  }

  final vignette = raw.substring(vignetteIdx + _vignetteMarker.length, questionIdx).trim();
  final questionText = raw.substring(questionIdx + _questionMarker.length).trim();

  if (vignette.isEmpty || questionText.isEmpty) {
    return ParsedUsmleQuestion(
      isLinked: false,
      questionText: raw.trim(),
    );
  }

  return ParsedUsmleQuestion(
    isLinked: true,
    vignette: vignette,
    questionText: questionText,
  );
}
