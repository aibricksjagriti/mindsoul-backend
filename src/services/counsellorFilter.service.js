import { db } from "../config/firebase.js";

// export const filterCounsellorsService = async (filters) => {
//   const { languages, expertise } = filters;

//   // Base collection
//   let query = db.collection("counsellors").where("isCounsellor", "==", true);

//   // STEP 1: Only ONE allowed Firestore array filter
//   let primaryFilterApplied = false;

//   if (languages && languages.length > 0) {
//     query = query.where(
//       "profileData.languages",
//       "array-contains-any",
//       languages
//     );
//     primaryFilterApplied = true;
//   } else if (expertise && expertise.length > 0) {
//     query = query.where(
//       "profileData.expertise",
//       "array-contains-any",
//       expertise
//     );
//     primaryFilterApplied = true;
//   }

//   // STEP 2: Fetch initial results from Firestore
//   const snapshot = await query.get();
//   let results = snapshot.docs.map((doc) => ({
//     id: doc.id,
//     ...doc.data(),
//   }));

//   // STEP 3: Apply remaining filters in Node.js

//   // If languages were NOT used as primary query → filter manually
//   if (!primaryFilterApplied && languages && languages.length > 0) {
//     results = results.filter((c) =>
//       c.profileData?.languages?.some((lang) => languages.includes(lang))
//     );
//   }

//   // If expertise is provided but NOT used as primary filter → filter manually
//   if (
//     expertise &&
//     expertise.length > 0 &&
//     !(primaryFilterApplied && languages)
//   ) {
//     results = results.filter((c) =>
//       c.profileData?.expertise?.some((exp) => expertise.includes(exp))
//     );
//   }

//   return results;
// };

export const filterCounsellorsService = async ({ languages = [], expertise = [] }) => {
  let query = db.collection("counsellors").where("isCounsellor", "==", true);
  // Use one array filter; apply both requested dimensions to the resulting records.
  if (languages.length) query = query.where("profileData.languages", "array-contains-any", languages.slice(0, 30));
  else if (expertise.length) query = query.where("profileData.expertise", "array-contains-any", expertise.slice(0, 30));
  if (languages.length > 30 || expertise.length > 30) throw new Error("At most 30 filters per dimension are supported");
  const snapshot = await query.get();
  const text = (value) => typeof value === "string" ? value.trim() : String(value ?? "");
  const array = (value) => Array.isArray(value) ? value.filter((item) => typeof item === "string") : typeof value === "string" ? [value] : [];
  return snapshot.docs.filter((doc) => doc.data().profileCompleted === true && doc.data().isVerified === true).map((doc) => {
    const p = doc.data().profileData || {};
    return { id: doc.id, counsellorId: doc.id, firstName: text(p.firstName), lastName: text(p.lastName),
      expertise: array(p.expertise), experience: text(p.experience), languages: array(p.languages), imageUrl: text(p.imageUrl) };
  }).filter((c) => (!languages.length || c.languages.some((value) => languages.includes(value))) &&
    (!expertise.length || c.expertise.some((value) => expertise.includes(value))));
};
