# Firestore セキュリティルール例

特定のGoogleアカウントのみがFirestoreに書き込みできるようにするには、以下のようなセキュリティルールを設定してください。

```text
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /shared-memo/latest {
      allow read: if request.auth != null;
      allow write: if request.auth != null && request.auth.token.email == 'yourname@gmail.com';
    }
  }
}
```

- `yourname@gmail.com` を同期を許可したいGoogleアカウントのメールアドレスに変更してください。
- 本番運用時は必要に応じて複数アカウントやより厳密な条件に拡張してください。
