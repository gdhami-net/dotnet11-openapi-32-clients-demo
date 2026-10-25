var builder = WebApplication.CreateBuilder(args);

#if PIN_OPENAPI_31
builder.Services.AddOpenApi(options =>
{
    options.OpenApiVersion = Microsoft.OpenApi.OpenApiSpecVersion.OpenApi3_1;
});
#else
builder.Services.AddOpenApi();
#endif

var app = builder.Build();

app.MapOpenApi();
app.MapTodoApi();

app.Run();
