using EggsApp.Api.Data;
using EggsApp.Api.Features.Common;

namespace EggsApp.Api.Features.Payments;

public static class PaymentEndpoints
{
    public static RouteGroupBuilder MapPayments(this RouteGroupBuilder api)
    {
        // Created under the customer who pays, so an abono can't be entered without one.
        api.MapPost(
                "/customers/{customerId:guid}/payments",
                async (AppDbContext db, Guid customerId, PaymentCommand command) =>
                {
                    var (errors, fields) = PaymentValidator.Validate(command);

                    if (fields is null)
                    {
                        return Results.ValidationProblem(errors);
                    }

                    var outcome = await CreatePayment.HandleAsync(db, customerId, fields);
                    return outcome.ToResult(payment => Results.Created($"/api/payments/{payment.Id}", payment));
                })
            .WithName("CreatePayment");

        var payments = api.MapGroup("/payments");

        payments.MapGet("/", async (AppDbContext db, string? from, string? to) =>
            {
                var errors = CalendarDays.ReadRange(from, to, out var first, out var last);

                return errors.Count > 0
                    ? Results.ValidationProblem(errors)
                    : Results.Ok(await ListPayments.HandleAsync(db, first, last));
            })
            .WithName("ListPayments");

        payments.MapGet("/{id:guid}", async (AppDbContext db, Guid id) =>
                await GetPayment.HandleAsync(db, id) is { } payment
                    ? Results.Ok(payment)
                    : Results.NotFound())
            .WithName("GetPayment");

        payments.MapPut("/{id:guid}", async (AppDbContext db, Guid id, PaymentCommand command) =>
            {
                var (errors, fields) = PaymentValidator.Validate(command);

                if (fields is null)
                {
                    return Results.ValidationProblem(errors);
                }

                var outcome = await UpdatePayment.HandleAsync(db, id, fields);
                return outcome.ToResult(payment => Results.Ok(payment));
            })
            .WithName("UpdatePayment");

        payments.MapDelete("/{id:guid}", async (AppDbContext db, Guid id) =>
                (await DeletePayment.HandleAsync(db, id)).ToResult(_ => Results.NoContent()))
            .WithName("DeletePayment");

        return api;
    }
}
