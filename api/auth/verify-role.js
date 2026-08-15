// api/auth/verify-role.js
const DATABASE_URL = process.env.FIREBASE_DATABASE_URL;
const DATABASE_SECRET = process.env.FIREBASE_DATABASE_SECRET;

/**
 * Verify Admin Role
 * GET /api/auth/verify-role?uid=USER_UID
 * 
 * Response:
 * {
 *   success: boolean,
 *   data: {
 *     isAdmin: boolean,
 *     isSuperAdmin: boolean,
 *     role: string,
 *     adminData: object
 *   }
 * }
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      message: 'Method not allowed. Use GET.'
    });
  }

  try {
    const { uid } = req.query;

    // === VALIDATE ===
    if (!DATABASE_URL || !DATABASE_SECRET) {
      console.error('❌ Firebase database credentials are not set');
      return res.status(500).json({
        success: false,
        message: 'Database configuration error.'
      });
    }

    if (!uid) {
      return res.status(400).json({
        success: false,
        message: 'User UID is required.'
      });
    }

    // === CHECK IF USER IS SUPER ADMIN (Hardcoded) ===
    const SUPER_ADMIN_EMAIL = process.env.SUPER_ADMIN_EMAIL || 'jesseegwuatu@gmail.com';
    
    // Get user email from database
    const userResponse = await fetch(
      `${DATABASE_URL}/users/${uid}/email.json?auth=${DATABASE_SECRET}`
    );
    
    if (!userResponse.ok) {
      throw new Error('Failed to fetch user data');
    }
    
    const userEmail = await userResponse.json();

    // Check if super admin
    if (userEmail === SUPER_ADMIN_EMAIL) {
      return res.status(200).json({
        success: true,
        data: {
          isAdmin: true,
          isSuperAdmin: true,
          role: 'super_admin',
          adminData: {
            email: userEmail,
            uid: uid,
            displayName: 'Super Admin',
            role: 'super_admin'
          }
        }
      });
    }

    // === CHECK ADMIN ROLE IN DATABASE ===
    const adminResponse = await fetch(
      `${DATABASE_URL}/admins/${uid}.json?auth=${DATABASE_SECRET}`
    );

    if (!adminResponse.ok) {
      throw new Error('Failed to fetch admin data');
    }

    const adminData = await adminResponse.json();

    if (adminData && adminData.role === 'admin') {
      return res.status(200).json({
        success: true,
        data: {
          isAdmin: true,
          isSuperAdmin: false,
          role: 'admin',
          adminData: adminData
        }
      });
    }

    // === NOT ADMIN ===
    return res.status(200).json({
      success: true,
      data: {
        isAdmin: false,
        isSuperAdmin: false,
        role: 'customer',
        adminData: null
      }
    });

  } catch (error) {
    console.error('Verify role error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to verify role.'
    });
  }
}