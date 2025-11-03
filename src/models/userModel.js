let users = []; //temp in-memory array

export const getUserByEmail = (email) => users.find(u => u.email === email  );

export const addUser = (user) => users.push(user);