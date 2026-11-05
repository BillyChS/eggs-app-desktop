using EggsApp.Api.Data;

namespace EggsApp.Api.Features.Sales;

public static class SaleEndpoints
{
    public static RouteGroupBuilder MapSales(this RouteGroupBuilder api)
    {
        var sales = api.MapGroup("/sales");

        sales.MapGet("/", async (AppDbContext db, string? from, string? to) =>
            {
                var errors = new Dictionary<string, string[]>();

                if (!SaleValidator.TryParseDate(from, out var first))
                {
                    errors["from"] = ["Esa fecha no es válida."];
                }

                if (!SaleValidator.TryParseDate(to, out var last))
                {
                    errors["to"] = ["Esa fecha no es válida."];
                }

                if (errors.Count == 0 && first > last)
                {
                    errors["to"] = ["La fecha final no puede ser antes de la inicial."];
                }

                return errors.Count > 0
                    ? Results.ValidationProblem(errors)
                    : Results.Ok(await ListSales.HandleAsync(db, first, last));
            })
            .WithName("ListSales");

        sales.MapGet("/last-prices", (AppDbContext db) => FindLastPrices.HandleAsync(db))
            .WithName("FindLastPrices");

        sales.MapGet("/{id:guid}", async (AppDbContext db, Guid id) =>
                await GetSale.HandleAsync(db, id) is { } sale
                    ? Results.Ok(sale)
                    : Results.NotFound())
            .WithName("GetSale");

        sales.MapPost("/", async (AppDbContext db, SaleCommand command) =>
            {
                var (errors, fields) = SaleValidator.Validate(command);

                if (fields is null)
                {
                    return Results.ValidationProblem(errors);
                }

                var sale = await CreateSale.HandleAsync(db, fields);
                return Results.Created($"/api/sales/{sale.Id}", sale);
            })
            .WithName("CreateSale");

        sales.MapPut("/{id:guid}", async (AppDbContext db, Guid id, SaleCommand command) =>
            {
                var (errors, fields) = SaleValidator.Validate(command);

                if (fields is null)
                {
                    return Results.ValidationProblem(errors);
                }

                return await UpdateSale.HandleAsync(db, id, fields) is { } sale
                    ? Results.Ok(sale)
                    : Results.NotFound();
            })
            .WithName("UpdateSale");

        sales.MapDelete("/{id:guid}", async (AppDbContext db, Guid id) =>
                await DeleteSale.HandleAsync(db, id)
                    ? Results.NoContent()
                    : Results.NotFound())
            .WithName("DeleteSale");

        return api;
    }
}
