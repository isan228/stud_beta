class University {
  University({required this.id, required this.name, this.shortName, this.description});

  final int id;
  final String name;
  final String? shortName;
  final String? description;

  factory University.fromJson(Map<String, dynamic> json) => University(
        id: json['id'] as int,
        name: json['name'] as String? ?? '',
        shortName: json['shortName'] as String?,
        description: json['description'] as String?,
      );
}

class UserModel {
  UserModel({
    required this.id,
    required this.username,
    required this.email,
    this.referralCode,
    this.coins = 0,
    this.subscriptionEndDate,
    this.usmleSubscriptionEndDate,
    this.universityId,
    this.university,
    this.createdAt,
  });

  final int id;
  final String username;
  final String email;
  final String? referralCode;
  final int coins;
  final String? subscriptionEndDate;
  final String? usmleSubscriptionEndDate;
  final int? universityId;
  final University? university;
  final String? createdAt;

  factory UserModel.fromJson(Map<String, dynamic> json) => UserModel(
        id: json['id'] as int,
        username: json['username'] as String? ?? '',
        email: json['email'] as String? ?? '',
        referralCode: json['referralCode'] as String?,
        coins: json['coins'] as int? ?? 0,
        subscriptionEndDate: json['subscriptionEndDate'] as String?,
        usmleSubscriptionEndDate: json['usmleSubscriptionEndDate'] as String?,
        universityId: json['universityId'] as int?,
        university: json['University'] != null
            ? University.fromJson(json['University'] as Map<String, dynamic>)
            : null,
        createdAt: json['createdAt'] as String?,
      );
}
