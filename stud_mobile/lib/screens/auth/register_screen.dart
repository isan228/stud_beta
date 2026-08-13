import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/api_exception.dart';
import '../../models/user.dart';
import '../../providers/auth_provider.dart';
import '../../services/misc_services.dart';

class RegisterScreen extends ConsumerStatefulWidget {
  const RegisterScreen({super.key});

  @override
  ConsumerState<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends ConsumerState<RegisterScreen> {
  final _formKey = GlobalKey<FormState>();
  final _usernameController = TextEditingController();
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  final _referralController = TextEditingController();

  List<University> _universities = [];
  int? _universityId;
  bool _consent = false;
  bool _offer = false;
  bool _loadingUniversities = true;

  @override
  void initState() {
    super.initState();
    _loadUniversities();
  }

  Future<void> _loadUniversities() async {
    try {
      final list = await ref.read(universitiesServiceProvider).getUniversities();
      if (!mounted) return;
      setState(() {
        _universities = list;
        _loadingUniversities = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _loadingUniversities = false);
    }
  }

  @override
  void dispose() {
    _usernameController.dispose();
    _emailController.dispose();
    _passwordController.dispose();
    _referralController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    if (_universityId == null) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Выберите университет')));
      return;
    }
    if (!_consent || !_offer) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Необходимо согласие с условиями')));
      return;
    }

    try {
      await ref.read(authProvider.notifier).register(
            username: _usernameController.text.trim(),
            email: _emailController.text.trim(),
            password: _passwordController.text,
            universityId: _universityId!,
            referralCode: _referralController.text.trim().isEmpty
                ? null
                : _referralController.text.trim(),
          );
      if (!mounted) return;
      context.go('/');
    } catch (e) {
      if (!mounted) return;
      final msg = e is ApiException ? e.message : 'Ошибка регистрации';
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
    }
  }

  @override
  Widget build(BuildContext context) {
    final loading = ref.watch(authProvider).isLoading;

    return Scaffold(
      appBar: AppBar(title: const Text('Регистрация')),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                TextFormField(
                  controller: _usernameController,
                  decoration: const InputDecoration(labelText: 'Никнейм'),
                  validator: (v) {
                    if (v == null || v.trim().length < 3) return 'От 3 до 50 символов';
                    return null;
                  },
                ),
                const SizedBox(height: 12),
                TextFormField(
                  controller: _emailController,
                  decoration: const InputDecoration(labelText: 'Email'),
                  keyboardType: TextInputType.emailAddress,
                  validator: (v) {
                    if (v == null || !v.contains('@')) return 'Некорректный email';
                    return null;
                  },
                ),
                const SizedBox(height: 12),
                TextFormField(
                  controller: _passwordController,
                  decoration: const InputDecoration(labelText: 'Пароль'),
                  obscureText: true,
                  validator: (v) => (v == null || v.length < 6) ? 'Минимум 6 символов' : null,
                ),
                const SizedBox(height: 12),
                if (_loadingUniversities)
                  const LinearProgressIndicator()
                else
                  DropdownButtonFormField<int>(
                    value: _universityId,
                    decoration: const InputDecoration(labelText: 'Университет'),
                    items: _universities
                        .map((u) => DropdownMenuItem(value: u.id, child: Text(u.shortName ?? u.name)))
                        .toList(),
                    onChanged: (v) => setState(() => _universityId = v),
                  ),
                const SizedBox(height: 12),
                TextFormField(
                  controller: _referralController,
                  decoration: const InputDecoration(labelText: 'Реферальный код (необязательно)'),
                ),
                CheckboxListTile(
                  value: _consent,
                  onChanged: (v) => setState(() => _consent = v ?? false),
                  title: const Text('Согласие на обработку данных', style: TextStyle(fontSize: 14)),
                  controlAffinity: ListTileControlAffinity.leading,
                  contentPadding: EdgeInsets.zero,
                ),
                CheckboxListTile(
                  value: _offer,
                  onChanged: (v) => setState(() => _offer = v ?? false),
                  title: const Text('Согласие с публичной офертой', style: TextStyle(fontSize: 14)),
                  controlAffinity: ListTileControlAffinity.leading,
                  contentPadding: EdgeInsets.zero,
                ),
                const SizedBox(height: 16),
                FilledButton(
                  onPressed: loading ? null : _submit,
                  child: loading
                      ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2))
                      : const Text('Зарегистрироваться'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
