import 'package:flutter/material.dart';

import '../utils/usmle_question_parser.dart';

class LinkedQuestionContent extends StatelessWidget {
  const LinkedQuestionContent({
    super.key,
    required this.text,
    this.isFirstInLinkedGroup = false,
    this.questionStyle,
    this.vignetteStyle,
  });

  final String text;
  final bool isFirstInLinkedGroup;
  final TextStyle? questionStyle;
  final TextStyle? vignetteStyle;

  @override
  Widget build(BuildContext context) {
    final parsed = parseUsmleQuestionText(text);
    final theme = Theme.of(context);

    if (!parsed.isLinked) {
      return Text(text, style: questionStyle ?? theme.textTheme.titleMedium);
    }

    if (!isFirstInLinkedGroup) {
      return Text(
        parsed.questionText,
        style: questionStyle ?? theme.textTheme.titleMedium,
      );
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
            'Связанный вопрос: далее несколько вопросов по одному клиническому случаю.',
            style: theme.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w600),
          ),
        ),
        const SizedBox(height: 12),
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: theme.colorScheme.primaryContainer.withValues(alpha: 0.35),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: theme.colorScheme.primary.withValues(alpha: 0.25)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Клинический случай',
                style: theme.textTheme.labelLarge?.copyWith(
                  color: theme.colorScheme.primary,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                parsed.vignette!,
                style: vignetteStyle ?? theme.textTheme.bodyLarge,
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),
        Text(
          parsed.questionText,
          style: questionStyle ?? theme.textTheme.titleMedium,
        ),
      ],
    );
  }
}
