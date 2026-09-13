// Публичная конфигурация веб-приложения Firebase.
// Замените плейсхолдеры значениями из Firebase Console → Project settings → Your apps.
// Эти значения идентифицируют проект и по модели Firebase не являются секретами.
export const firebaseConfig = {
  apiKey: 'AIzaSyC_nrzJy5SQyvwjRqQqK0u3amQL1lTdCDo',
  authDomain: 'wishlist-b3953.firebaseapp.com',
  projectId: 'wishlist-b3953',
  storageBucket: 'wishlist-b3953.firebasestorage.app',
  messagingSenderId: '321454509474',
  appId: '1:321454509474:web:f9f31c371dec67f228f6fb'
};

export const firebaseConfigured = !Object.values(firebaseConfig).some(value => value.includes('YOUR_'));
