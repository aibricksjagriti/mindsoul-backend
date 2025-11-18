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

export const filterCounsellorsService = async (filters) => {
  const { languages, expertise } = filters;

  let query = db.collection("counsellors").where("isCounsellor", "==", true);

  let primaryFilterApplied = false;

  if (languages && languages.length > 0) {
    query = query.where(
      "profileData.languages",
      "array-contains-any",
      languages
    );
    primaryFilterApplied = true;
  } else if (expertise && expertise.length > 0) {
    query = query.where(
      "profileData.expertise",
      "array-contains-any",
      expertise
    );
    primaryFilterApplied = true;
  }

  const snapshot = await query.get();

  //sending the final filtered data to frontend 
  let results = snapshot.docs.map((doc) => {
  const data = doc.data();
  const p = data.profileData || {};

  return {
    id: doc.id,
    firstName: p.firstName?.trim() || "",
    lastName: p.lastName?.trim() || "",
    expertise: p.expertise || [],
    experience: p.experience?.trim() || "",
    languages: p.languages || [],
    imageUrl: p.imageUrl || "",
  };
});


  if (!primaryFilterApplied && languages && languages.length > 0) {
    results = results.filter((c) =>
      c.profileData?.languages?.some((lang) => languages.includes(lang))
    );
  }

  if (
    expertise &&
    expertise.length > 0 &&
    !(primaryFilterApplied && languages)
  ) {
    results = results.filter((c) =>
      c.profileData?.expertise?.some((exp) => expertise.includes(exp))
    );
  }

  return results;
};
