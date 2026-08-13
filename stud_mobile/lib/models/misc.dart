class ChatMessageModel {
  ChatMessageModel({
    required this.id,
    required this.text,
    required this.isAdmin,
    required this.createdAt,
    this.isRead = false,
  });

  final int id;
  final String text;
  final bool isAdmin;
  final String createdAt;
  final bool isRead;

  factory ChatMessageModel.fromJson(Map<String, dynamic> json) => ChatMessageModel(
        id: json['id'] as int,
        text: json['text'] as String? ?? '',
        isAdmin: json['isAdmin'] == true,
        createdAt: json['createdAt'] as String? ?? '',
        isRead: json['isRead'] == true,
      );
}

class NewsItem {
  NewsItem({
    required this.id,
    required this.title,
    required this.content,
    this.publishedAt,
  });

  final int id;
  final String title;
  final String content;
  final String? publishedAt;

  factory NewsItem.fromJson(Map<String, dynamic> json) => NewsItem(
        id: json['id'] as int,
        title: json['title'] as String? ?? '',
        content: json['content'] as String? ?? json['body'] as String? ?? '',
        publishedAt: json['publishedAt'] as String?,
      );
}

class AccountAlert {
  AccountAlert({
    required this.id,
    required this.title,
    required this.message,
    this.createdAt,
    this.isDevice = false,
  });

  final int id;
  final String title;
  final String message;
  final String? createdAt;
  final bool isDevice;

  factory AccountAlert.device(Map<String, dynamic> json) => AccountAlert(
        id: json['id'] as int,
        title: 'Новое устройство',
        message: 'Вход с нового устройства (${json['ipAddress'] ?? 'неизвестно'})',
        createdAt: json['createdAt'] as String?,
        isDevice: true,
      );

  factory AccountAlert.broadcast(Map<String, dynamic> json) => AccountAlert(
        id: json['id'] as int,
        title: json['title'] as String? ?? 'Сообщение',
        message: json['message'] as String? ?? '',
        createdAt: json['createdAt'] as String?,
      );
}
