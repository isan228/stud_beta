import 'package:flutter/material.dart';

import '../utils/usmle_question_parser.dart';

class LinkedQuestionContent extends StatelessWidget {
  const LinkedQuestionContent({
    super.key,
    required this.text,
    this.isFirstInLinkedGroup = false,
    this.questionStyle,
  });

  final String text;
  final bool isFirstInLinkedGroup;
  final TextStyle? questionStyle;

  @override
  Widget build(BuildContext context) {
    final parsed = parseUsmleQuestionText(text);
    final theme = Theme.of(context);
    final question = Text(
      parsed.isLinked ? parsed.questionText : text,
      style: questionStyle ?? theme.textTheme.titleMedium,
    );

    if (!parsed.isLinked || !isFirstInLinkedGroup) {
      return question;
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: theme.colorScheme.tertiaryContainer.withValues(alpha: 0.35),
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: theme.colorScheme.tertiary.withValues(alpha: 0.35)),
          ),
          child: Text(
            'Связанный вопрос: далее несколько вопросов идут подряд в одной связке.',
            style: theme.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w600),
          ),
        ),
        const SizedBox(height: 12),
        question,
      ],
    );
  }
}
