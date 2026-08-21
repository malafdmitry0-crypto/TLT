"""Password hashing contract tests."""

from app.core.security import hash_password, verify_password


def test_password_hash_uses_canonical_bcrypt_scheme() -> None:
    password_hash = hash_password("correct horse battery staple")

    assert password_hash.startswith("$2b$")
    assert verify_password("correct horse battery staple", password_hash) is True
    assert verify_password("wrong password", password_hash) is False


def test_password_verification_rejects_legacy_hash_format() -> None:
    legacy_pbkdf2_hash = "$pbkdf2-sha256$29000$legacy$salt-and-digest"

    assert verify_password("password", legacy_pbkdf2_hash) is False
