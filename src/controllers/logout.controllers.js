export const logout = (req, res) => {
  res.clearCookie("mindsoul_token", {
    httpOnly: true,
    secure: true,
    sameSite: "None",
    path: "/",
  });
  return res.status(200).json({ success: true, message: "Logged out" });
};
