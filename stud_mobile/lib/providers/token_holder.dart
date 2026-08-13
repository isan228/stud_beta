/// Holds JWT token without creating a Riverpod cycle with ApiClient.
class AuthTokenHolder {
  String? token;
}

final authTokenHolder = AuthTokenHolder();
