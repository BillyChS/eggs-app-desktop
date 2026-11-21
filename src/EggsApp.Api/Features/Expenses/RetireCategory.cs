using EggsApp.Api.Data;
using EggsApp.Api.Features.Common;
using Microsoft.EntityFrameworkCore;

namespace EggsApp.Api.Features.Expenses;

/// <summary>
/// "Eliminar" in "Tipos de gasto": a soft delete. New expenses can't use it any more, but its expenses keep showing
/// its name and can keep it when edited. Adding a type with its name again brings it back.
/// </summary>
public static class RetireCategory
{
    public const string OtherMessage = "El tipo Otro no se puede eliminar.";

    public static async Task<Outcome<bool>> HandleAsync(AppDbContext db, Guid id)
    {
        var category = await db.ExpenseCategories.FirstOrDefaultAsync(candidate => candidate.Id == id);

        if (category is null)
        {
            return Outcome<bool>.NotFound();
        }

        if (category.NeedsDescription)
        {
            return Outcome<bool>.Refused(OtherMessage);
        }

        db.ExpenseCategories.Remove(category);
        await db.SaveChangesAsync();

        return Outcome<bool>.Done(true);
    }
}
