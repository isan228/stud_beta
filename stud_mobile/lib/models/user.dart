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

class FacultyModel {
  FacultyModel({
    required this.id,
    required this.name,
    this.shortName,
    this.universityId,
  });

  final int id;
  final String name;
  final String? shortName;
  final int? universityId;

  factory FacultyModel.fromJson(Map<String, dynamic> json) => FacultyModel(
        id: json['id'] as int,
        name: json['name'] as String? ?? '',
        shortName: json['shortName'] as String?,
        universityId: json['universityId'] as int?,
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
    this.subscriptionActive = false,
    this.usmleSubscriptionActive = false,
    this.isAdminAccount = false,
    this.universityId,
    this.university,
    this.facultyId,
    this.course,
    this.groupName,
    this.kgmaGroupId,
    this.faculty,
    this.createdAt,
  });

  final int id;
  final String username;
  final String email;
  final String? referralCode;
  final int coins;
  final String? subscriptionEndDate;
  final String? usmleSubscriptionEndDate;
  final bool subscriptionActive;
  final bool usmleSubscriptionActive;
  final bool isAdminAccount;
  final int? universityId;
  final University? university;
  final int? facultyId;
  final int? course;
  final String? groupName;
  final String? kgmaGroupId;
  final FacultyModel? faculty;
  final String? createdAt;

  bool get hasScheduleGroup =>
      (kgmaGroupId != null && kgmaGroupId!.isNotEmpty) ||
      (groupName != null && groupName!.isNotEmpty);

  bool get hasUniversitySubscription {
    if (isAdminAccount || subscriptionActive) return true;
    if (subscriptionEndDate == null || subscriptionEndDate!.isEmpty) return false;
    final end = DateTime.tryParse(subscriptionEndDate!);
    return end != null && end.isAfter(DateTime.now());
  }

  bool get hasUsmleSubscription {
    if (isAdminAccount || usmleSubscriptionActive) return true;
    if (usmleSubscriptionEndDate == null || usmleSubscriptionEndDate!.isEmpty) return false;
    final end = DateTime.tryParse(usmleSubscriptionEndDate!);
    return end != null && end.isAfter(DateTime.now());
  }

  factory UserModel.fromJson(Map<String, dynamic> json) => UserModel(
        id: json['id'] as int,
        username: json['username'] as String? ?? '',
        email: json['email'] as String? ?? '',
        referralCode: json['referralCode'] as String?,
        coins: json['coins'] as int? ?? 0,
        subscriptionEndDate: json['subscriptionEndDate'] as String?,
        usmleSubscriptionEndDate: json['usmleSubscriptionEndDate'] as String?,
        subscriptionActive: json['subscriptionActive'] == true,
        usmleSubscriptionActive: json['usmleSubscriptionActive'] == true,
        isAdminAccount: json['isAdminAccount'] == true,
        universityId: json['universityId'] as int?,
        university: json['University'] != null
            ? University.fromJson(json['University'] as Map<String, dynamic>)
            : null,
        facultyId: json['facultyId'] as int?,
        course: json['course'] as int?,
        groupName: json['groupName'] as String?,
        kgmaGroupId: json['kgmaGroupId'] as String?,
        faculty: json['Faculty'] != null
            ? FacultyModel.fromJson(json['Faculty'] as Map<String, dynamic>)
            : null,
        createdAt: json['createdAt'] as String?,
      );
}
