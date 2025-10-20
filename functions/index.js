/**
 * 서버 사이드 스케줄러:
 * - schedules/{uid}: { token, emoji, intervalMin, message, nextAt }
 * - 매 분 실행, nextAt <= now 인 사용자에게 푸시 전송, nextAt += intervalMin
 * - visibleFor 계산(메모 공유) 유틸 포함
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

const db = admin.firestore();
const fcm = admin.messaging();

// 매 분 실행
exports.tickScheduler = functions.pubsub.schedule('* * * * *').timeZone('Asia/Seoul').onRun(async () => {
  const now = admin.firestore.Timestamp.now();
  const batch = db.batch();

  const schedSnap = await db.collection('schedules').get();
  const tasks = [];

  schedSnap.forEach(docSnap => {
    const s = docSnap.data();
    if (!s.token || !s.intervalMin || s.intervalMin < 1) return;

    const nextAt = s.nextAt || admin.firestore.Timestamp.fromMillis(0);
    if (nextAt.toMillis() <= now.toMillis()) {
      const title = `${s.emoji || '🔔'} 리마인더`;
      const body = s.message || `${s.intervalMin}분 알림`;

      tasks.push(
        fcm.send({
          token: s.token,
          notification: { title, body }
        }).catch(() => null) // 토큰 만료 등 무시
      );

      const next = admin.firestore.Timestamp.fromMillis(now.toMillis() + s.intervalMin * 60 * 1000);
      batch.set(docSnap.ref, { nextAt: next, updatedAt: now }, { merge: true });
    }
  });

  await Promise.all(tasks);
  await batch.commit();
  return null;
});

// notes visibleFor 유지 (이메일 -> UID 맵핑)
exports.onNoteWrite = functions.firestore.document('notes/{noteId}').onWrite(async (change, context) => {
  const after = change.after.exists ? change.after.data() : null;
  if (!after) return null;

  const visibleSet = new Set();
  if (after.ownerUid) visibleSet.add(after.ownerUid);

  const emails = Array.isArray(after.sharedWith) ? after.sharedWith : [];
  if (emails.length) {
    // 이메일 -> uid 매핑: users 컬렉션을 사용(회원가입 시 생성)
    const usersRef = db.collection('users');
    const q = await usersRef.where('email', 'in', emails.slice(0, 10)).get(); // Firestore in 제한 10
    q.forEach(u => visibleSet.add(u.id));
  }

  await change.after.ref.set({ visibleFor: Array.from(visibleSet) }, { merge: true });
  return null;
});

// rooms/{roomId}/meta_updates 트리거로 rooms 문서 업데이트(마지막 메시지 등)
exports.onRoomMetaUpdate = functions.firestore
  .document('rooms/{roomId}/meta_updates/{metaId}')
  .onCreate(async (snap, ctx) => {
    const data = snap.data();
    await db.collection('rooms').doc(ctx.params.roomId)
      .set({ lastMessage: data.lastMessage || '', updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    return null;
});

// 사용자 문서 생성
exports.onAuthCreate = functions.auth.user().onCreate(async (user) => {
  await db.collection('users').doc(user.uid).set({
    email: user.email || null,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
});
