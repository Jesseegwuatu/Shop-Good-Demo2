const { auth } = require('../_lib/firebase');
const { success, error, options } = require('../_lib/response');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json(error('Method not allowed', 405));
  
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json(error('Email is required', 400));
    }
    
    try {
      await auth.getUserByEmail(email);
      res.json(success({ exists: true }));
    } catch (err) {
      if (err.code === 'auth/user-not-found') {
        res.json(success({ exists: false }));
      } else {
        throw err;
      }
    }
  } catch (err) {
    res.status(500).json(error(err.message, 500));
  }
};