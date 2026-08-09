import { connectToDatabase } from '@/lib/db/connect';
import { Category } from '@/lib/db/models/Category';
import { requireSessionUser } from '@/lib/auth/getSessionUser';
import { createCategorySchema } from '@/lib/validation/schemas';
import { conflict, created, handleRouteError, isDuplicateKeyError, ok } from '@/lib/apiResponse';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Categories are create + list only. Update/delete are out of scope: renaming
 * or removing a category would silently rewrite history on already-locked
 * periods, which is exactly the auditability property locking exists to
 * protect. Documented as a tradeoff in the README.
 */

export async function GET() {
  try {
    const user = await requireSessionUser();
    await connectToDatabase();

    const categories = await Category.find({ userId: user.userId })
      .sort({ name: 1 })
      .select('_id name')
      .lean();

    return ok({
      categories: categories.map((c) => ({ id: c._id.toString(), name: c.name })),
    });
  } catch (err) {
    return handleRouteError(err, 'categories:GET');
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser();
    const body = createCategorySchema.parse(await request.json());
    await connectToDatabase();

    try {
      const category = await Category.create({ userId: user.userId, name: body.name });
      return created({ category: { id: category._id.toString(), name: category.name } });
    } catch (err) {
      // Unique {userId, name} index - relied on instead of a read-then-write,
      // which would race under concurrent submits.
      if (isDuplicateKeyError(err)) {
        return conflict(`You already have a category named "${body.name}"`);
      }
      throw err;
    }
  } catch (err) {
    return handleRouteError(err, 'categories:POST');
  }
}
