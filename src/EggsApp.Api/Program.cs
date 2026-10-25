using EggsApp.Api;

var builder = WebApplication.CreateBuilder(args);

builder.AddEggsApp();
builder.Services.AddOpenApi();

var app = builder.Build();

// Swagger is only for standalone development; the desktop host never enables it.
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    app.UseSwaggerUI(options => options.SwaggerEndpoint("/openapi/v1.json", "Eggs App API"));
}

app.UseEggsApp();

app.Run();
