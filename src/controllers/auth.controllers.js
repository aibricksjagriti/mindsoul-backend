import jwt from "jsonwebtoken";
import argon2 from "argon2";
import { getUserByEmail, addUser } from "../models/userModel.js";

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  console.warn(
    "Warning: JWT_SECRET is not set. Using fallback secret (unsafe for production)."
  );
}

// //Signup
// export const signup = async (req, res) => {
//   try {
//     const { name, email, password } = req.body;
//     const existingUser = await getUserByEmail(email);
//     if (existingUser)
//       return res.status(400).json({
//         msg: "User already exists",
//       });

//     const hashed = await argon2.hash(password);
//     const user = {
//       id: Date.now(),
//       name,
//       email,
//       password: hashed,
//     };
//     addUser(user);

//     const token = jwt.sign(
//       {
//         id: user.id,
//         email,
//       },
//       JWT_SECRET,
//       {
//         expiresIn: "1h",
//       }
//     );

//     res.status(201).json({ msg: "Signup successful", token });
//   } catch (error) {
//     console.log(error);
//     res.status(500).json({ error: err.message });
//   }
// };

// //Login
// export const login = async (req, res) => {
//   try {
//     const { email, password } = req.body;
//     const user = await getUserByEmail(email);

//     if (!user)
//       return res.status(400).json({
//         msg: "Invalid credentials",
//       });

//     const valid = await argon2.verify(user.password, password);
//     if (!valid) {
//       return res.status(400).json({
//         msg: "Invalid credentials",
//       });
//     }

//     const token = jwt.sign(
//       {
//         id: user.id,
//         email: email,
//       },
//       JWT_SECRET,
//       {
//         expiresIn: "1h",
//       }
//     );
//     res.json({
//       msg: "Login successful",
//       token,
//     });
//   } catch (error) {
//     console.log(error);
//     res.status(500).json({ error: error.message });
//   }
// };

export const signup = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    //Validate input
    if (!name || !email || !password) {
      return res
        .status(400)
        .json({ success: false, message: "All fields are required." });
    }

    //Check if user already exists
    const existing = getUserByEmail(email);
    if (existing) {
      return res
        .status(409)
        .json({ success: false, message: "User already exists." });
    }

    //Hash password
    const hashed = await argon2.hash(password);

    //Save new user
    const user = { id: Date.now(), name, email, password: hashed };
    addUser(user);

    //Generate JWT
    const token = jwt.sign(
      { id: user.id, email },
      JWT_SECRET || "fallback_secret",
      {
        expiresIn: "1h",
      }
    );

    res.status(201).json({
      success: true,
      message: "Signup successful.",
      data: { token },
    });
  } catch (error) {
    console.error("Signup Error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error.",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    //Validate input
    if (!email || !password) {
      return res
        .status(400)
        .json({ success: false, message: "Email and password are required." });
    }

    //Find user
    const user = getUserByEmail(email);
    if (!user) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid credentials." });
    }

    //Verify password
    const valid = await argon2.verify(user.password, password);
    if (!valid) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid credentials." });
    }

    //Generate token
    const token = jwt.sign(
      { id: user.id, email },
      JWT_SECRET || "fallback_secret",
      {
        expiresIn: "1h",
      }
    );

    res.status(200).json({
      success: true,
      message: "Login successful.",
      data: { token },
    });
  } catch (error) {
    console.error("Login Error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error.",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};
