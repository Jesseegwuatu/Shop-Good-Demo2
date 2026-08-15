// api/products/list.js
const DATABASE_URL = process.env.FIREBASE_DATABASE_URL;
const DATABASE_SECRET = process.env.FIREBASE_DATABASE_SECRET;

/**
 * List Products
 * GET /api/products/list
 * 
 * Query Parameters:
 * - categoryId: string (optional) - Filter by category
 * - search: string (optional) - Search by name/brand/description
 * - sort: string (optional) - newest, price-low, price-high, popular, rating
 * - limit: number (optional) - Default 20
 * - offset: number (optional) - Default 0
 * - status: string (optional) - active, inactive
 * - featured: boolean (optional) - Filter featured products
 * - bestSeller: boolean (optional) - Filter best sellers
 * - inStock: boolean (optional) - Only show in-stock products
 */
export default async function handler(req, res) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      message: 'Method not allowed. Use GET.'
    });
  }

  try {
    const {
      categoryId,
      search,
      sort = 'newest',
      limit = 20,
      offset = 0,
      status = 'active',
      featured,
      bestSeller,
      inStock
    } = req.query;

    // === VALIDATE ENVIRONMENT VARIABLES ===
    if (!DATABASE_URL || !DATABASE_SECRET) {
      console.error('❌ Firebase database credentials are not set');
      return res.status(500).json({
        success: false,
        message: 'Database configuration error.'
      });
    }

    // === FETCH ALL PRODUCTS ===
    const productsResponse = await fetch(
      `${DATABASE_URL}/products.json?auth=${DATABASE_SECRET}`
    );

    if (!productsResponse.ok) {
      throw new Error('Failed to fetch products');
    }

    const productsData = await productsResponse.json();

    if (!productsData) {
      return res.status(200).json({
        success: true,
        data: [],
        meta: {
          total: 0,
          limit: parseInt(limit),
          offset: parseInt(offset),
          hasMore: false
        }
      });
    }

    // === CONVERT TO ARRAY ===
    let products = Object.entries(productsData).map(([key, value]) => ({
      id: key,
      ...value
    }));

    // === APPLY FILTERS ===

    // 1. Status filter
    if (status) {
      products = products.filter(p => p.status === status);
    }

    // 2. Category filter
    if (categoryId) {
      products = products.filter(p => p.categoryId === categoryId);
    }

    // 3. Featured filter
    if (featured === 'true') {
      products = products.filter(p => p.featured === true);
    }

    // 4. Best Seller filter
    if (bestSeller === 'true') {
      products = products.filter(p => p.bestSeller === true);
    }

    // 5. In Stock filter
    if (inStock === 'true') {
      products = products.filter(p => (p.stock?.available || 0) > 0);
    }

    // 6. Search filter
    if (search && search.trim()) {
      const query = search.toLowerCase().trim();
      products = products.filter(p =>
        (p.name || '').toLowerCase().includes(query) ||
        (p.brand || '').toLowerCase().includes(query) ||
        (p.description || '').toLowerCase().includes(query)
      );
    }

    // === APPLY SORTING ===
    switch (sort) {
      case 'newest':
        products.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        break;
      case 'price-low':
        products.sort((a, b) => (a.price?.display || a.price?.base || 0) - (b.price?.display || b.price?.base || 0));
        break;
      case 'price-high':
        products.sort((a, b) => (b.price?.display || b.price?.base || 0) - (a.price?.display || a.price?.base || 0));
        break;
      case 'popular':
        products.sort((a, b) => (b.soldCount || 0) - (a.soldCount || 0));
        break;
      case 'rating':
        products.sort((a, b) => (b.rating?.average || 0) - (a.rating?.average || 0));
        break;
      default:
        // 'newest' is default
        products.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    }

    // === APPLY PAGINATION ===
    const total = products.length;
    const start = parseInt(offset);
    const end = Math.min(start + parseInt(limit), total);
    const paginatedProducts = products.slice(start, end);

    // === GET CATEGORIES FOR RESPONSE ===
    const categoriesResponse = await fetch(
      `${DATABASE_URL}/categories.json?auth=${DATABASE_SECRET}`
    );
    let categories = {};
    if (categoriesResponse.ok) {
      categories = await categoriesResponse.json() || {};
    }

    // === ENRICH PRODUCTS WITH CATEGORY NAMES ===
    const enrichedProducts = paginatedProducts.map(product => {
      const category = categories[product.categoryId];
      return {
        ...product,
        categoryName: category?.name || 'Uncategorized',
        categoryImage: category?.image || null
      };
    });

    // === RETURN RESPONSE ===
    return res.status(200).json({
      success: true,
      data: enrichedProducts,
      meta: {
        total: total,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: end < total,
        totalPages: Math.ceil(total / parseInt(limit)),
        currentPage: Math.floor(parseInt(offset) / parseInt(limit)) + 1
      },
      filters: {
        categoryId: categoryId || null,
        search: search || null,
        sort: sort,
        status: status || 'all'
      }
    });

  } catch (error) {
    console.error('List products error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to list products.'
    });
  }
}