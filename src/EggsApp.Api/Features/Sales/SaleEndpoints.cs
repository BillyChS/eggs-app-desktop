using EggsApp.Api.Data;
using EggsApp.Api.Features.Common;

namespace EggsApp.Api.Features.Sales;

public static class SaleEndpoints
{
    public static RouteGroupBuilder MapSales(this RouteGroupBuilder api)
    {
        var sales = api.MapGroup("/sales");

        sales.MapGet("/", async (AppDbContext db, string? from, string? to) =>
            {
                var errors = CalendarDays.ReadRange(from, to, out var first, out var last);

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

                var outcome = await CreateSale.HandleAsync(db, fields);
                return outcome.ToResult(sale => Results.Created($"/api/sales/{sale.Id}", sale));
            })
            .WithName("CreateSale");

        sales.MapPut("/{id:guid}", async (AppDbContext db, Guid id, SaleCommand command) =>
            {
                var (errors, fields) = SaleValidator.Validate(command);

                if (fields is null)
                {
                    return Results.ValidationProblem(errors);
                }

                var outcome = await UpdateSale.HandleAsync(db, id, fields);
                return outcome.ToResult(sale => Results.Ok(sale));
            })
            .WithName("UpdateSale");

        sales.MapDelete("/{id:guid}", async (AppDbContext db, Guid id) =>
                (await DeleteSale.HandleAsync(db, id)).ToResult(_ => Results.NoContent()))
            .WithName("DeleteSale");

        return api;
    }
}
