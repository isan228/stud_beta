class ParsedUsmleQuestion {
  const ParsedUsmleQuestion({
    required this.isLinked,
    required this.questionText,
    this.groupId,
    this.vignette,
  });

  final bool isLinked;
  final String? groupId;
  final String? vignette;
  final String questionText;
}

const _groupMarker = '<<<USMLE_GROUP>>>';
const _vignetteMarker = '<<<USMLE_VIGNETTE>>>';
const _questionMarker = '<<<USMLE_QUESTION>>>';

ParsedUsmleQuestion parseUsmleQuestionText(String? text) {
  final raw = text ?? '';
  final vignetteIdx = raw.indexOf(_vignetteMarker);
  final questionIdx = raw.indexOf(_questionMarker);

  String? groupId;
  final groupIdx = raw.indexOf(_groupMarker);
  if (groupIdx != -1) {
    final after = raw.substring(groupIdx + _groupMarker.length);
    final endMatch = RegExp(r'[\r\n<]').firstMatch(after);
    final end = endMatch?.start ?? after.length;
    final value = after.substring(0, end).trim();
    groupId = value.isEmpty ? null : value;
  }

  if (groupId != null && questionIdx != -1) {
    final questionText = raw.substring(questionIdx + _questionMarker.length).trim();
    return ParsedUsmleQuestion(
      isLinked: questionText.isNotEmpty,
      groupId: groupId,
      vignette: null,
      questionText: questionText.isEmpty ? raw.trim() : questionText,
    );
  }

  if (vignetteIdx != -1 && questionIdx != -1 && questionIdx > vignetteIdx) {
    final questionText = raw.substring(questionIdx + _questionMarker.length).trim();
    return ParsedUsmleQuestion(
      isLinked: questionText.isNotEmpty || groupId != null,
      groupId: groupId,
      vignette: null,
      questionText: questionText.isEmpty ? raw.trim() : questionText,
    );
  }

  if (groupId != null) {
    return ParsedUsmleQuestion(
      isLinked: true,
      groupId: groupId,
      vignette: null,
      questionText: raw.replaceFirst('$_groupMarker$groupId', '').trim(),
    );
  }

  return ParsedUsmleQuestion(
    isLinked: false,
    questionText: raw.trim(),
  );
}

String? linkedClusterKey(String? text) {
  final parsed = parseUsmleQuestionText(text);
  if (parsed.groupId != null && parsed.groupId!.isNotEmpty) {
    return 'g:${parsed.groupId}';
  }
  return null;
}

bool isFirstLinkedQuestionInList(List<dynamic> questions, int index) {
  if (index < 0 || index >= questions.length) return false;
  final current = questions[index];
  final currentText = current is String ? current : current.text as String?;
  final key = linkedClusterKey(currentText);
  if (key == null) return false;
  if (index == 0) return true;
  final prev = questions[index - 1];
  final prevText = prev is String ? prev : prev.text as String?;
  return linkedClusterKey(prevText) != key;
}
