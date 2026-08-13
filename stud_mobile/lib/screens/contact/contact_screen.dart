import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_exception.dart';
import '../../services/misc_services.dart';

class ContactScreen extends ConsumerStatefulWidget {
  const ContactScreen({super.key});

  @override
  ConsumerState<ContactScreen> createState() => _ContactScreenState();
}

class _ContactScreenState extends ConsumerState<ContactScreen> {
  final _formKey = GlobalKey<FormState>();
  final _nameController = TextEditingController();
  final _emailController = TextEditingController();
  final _messageController = TextEditingController();
  String _subject = 'feedback';
  bool _sending = false;

  @override
  void dispose() {
    _nameController.dispose();
    _emailController.dispose();
    _messageController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _sending = true);
    try {
      await ref.read(contactServiceProvider).sendContact(
            name: _nameController.text.trim(),
            email: _emailController.text.trim(),
            subject: _subject,
            message: _messageController.text.trim(),
          );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Сообщение отправлено')));
      _messageController.clear();
    } catch (e) {
      if (!mounted) return;
      final msg = e is ApiException ? e.message : 'Ошибка отправки';
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Обратная связь')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Form(
          key: _formKey,
          child: Column(
            children: [
              TextFormField(
                controller: _nameController,
                decoration: const InputDecoration(labelText: 'Имя'),
                validator: (v) => (v == null || v.trim().isEmpty) ? 'Обязательное поле' : null,
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _emailController,
                decoration: const InputDecoration(labelText: 'Email'),
                keyboardType: TextInputType.emailAddress,
                validator: (v) => (v == null || !v.contains('@')) ? 'Некорректный email' : null,
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                value: _subject,
                decoration: const InputDecoration(labelText: 'Тема'),
                items: const [
                  DropdownMenuItem(value: 'question', child: Text('Вопрос')),
                  DropdownMenuItem(value: 'suggestion', child: Text('Предложение')),
                  DropdownMenuItem(value: 'feedback', child: Text('Отзыв')),
                  DropdownMenuItem(value: 'bug', child: Text('Ошибка')),
                  DropdownMenuItem(value: 'other', child: Text('Другое')),
                ],
                onChanged: (v) => setState(() => _subject = v ?? 'feedback'),
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _messageController,
                decoration: const InputDecoration(labelText: 'Сообщение'),
                maxLines: 5,
                validator: (v) => (v == null || v.trim().isEmpty) ? 'Обязательное поле' : null,
              ),
              const SizedBox(height: 24),
              FilledButton(
                onPressed: _sending ? null : _submit,
                child: _sending
                    ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2))
                    : const Text('Отправить'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
