import User from '../models/user.model.js';
import { generateToken } from '../middleware/auth.middleware.js';
import { asyncHandler, AppError } from '../middleware/error.middleware.js';

export const register = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;

  const existing = await User.findOne({ email });
  if (existing) {
    throw new AppError('Email already registered', 400);
  }

  const user = await User.create({ name, email, password, isVerified: true });

  generateToken(user._id, res);

  res.status(201).json({
    success: true,
    message: 'Registration successful',
    user,
  });
});

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email }).select('+password');
  if (!user || !user.password) {
    throw new AppError('Invalid email or password', 401);
  }

  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    throw new AppError('Invalid email or password', 401);
  }

  generateToken(user._id, res);

  res.json({
    success: true,
    message: 'Login successful',
    user,
  });
});



export const logout = asyncHandler(async (req, res) => {
  res.cookie('token', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    expires: new Date(0),
  });
  res.json({ success: true, message: 'Logged out successfully' });
});

export const getMe = asyncHandler(async (req, res) => {
  res.json({ success: true, user: req.user });
});

export const googleLogin = asyncHandler(async (req, res) => {
  const { accessToken } = req.body;

  if (!accessToken) {
    throw new AppError('Access token is required', 400);
  }

  const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new AppError('Invalid Google access token', 401);
  }

  const profile = await response.json();
  const { email, name, sub: googleId, picture: avatar } = profile;

  let user = await User.findOne({ email });

  if (user) {
    if (!user.googleId) {
      user.googleId = googleId;
      user.avatar = user.avatar || avatar;
      user.isVerified = true;
      await user.save();
    }
  } else {
    user = await User.create({
      name,
      email,
      googleId,
      avatar,
      isVerified: true,
    });
  }

  generateToken(user._id, res);

  res.json({
    success: true,
    message: 'Google login successful',
    user,
  });
});
