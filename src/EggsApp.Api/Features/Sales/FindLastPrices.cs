using EggsApp.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace EggsApp.Api.Features.Sales;

public static class FindLastPrices
{
    /// <summary>
    /// The price of the latest active line per carton type, to start the form with. Latest by the day of the sale, so
    /// typing in an old sale, at an old price, doesn't replace the current one.
    /// </summary>
    /// <returns>The prices by carton type. A type that has never been sold isn't there.</returns>
    public static async Task<Dictionary<string, long>> HandleAsync(AppDbContext db)
    {
        var prices = new Dictionary<string, long>();

        foreach (var cartonType in Enum.GetValues<CartonType>())
        {
            var latest = await db.SaleItems
                .AsNoTracking()
                .Where(item => item.CartonType == cartonType)
                .OrderByDescending(item => item.Sale.SaleDate)
                .ThenByDescending(item => item.CreatedAt)
                .ThenByDescending(item => item.Position)
                .Select(item => (long?)item.UnitPrice)
                .FirstOrDefaultAsync();

            if (latest is { } price)
            {
                prices[cartonType.ToString()] = price;
            }
        }

        return prices;
    }
}
