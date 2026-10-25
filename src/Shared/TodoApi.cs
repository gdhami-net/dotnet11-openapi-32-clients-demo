using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Http.HttpResults;

// The same small API is compiled twice: once on .NET 10 (src/Api10) and once on
// .NET 11 RC2 (src/Api11). Nothing in this file changes between the two.

[JsonConverter(typeof(JsonStringEnumConverter<Priority>))]
public enum Priority { Low, Normal, High }

public record Todo(int Id, string Title, string? Notes, Priority Priority, DateTimeOffset? DueAt);

public record CreateTodo(string Title, string? Notes, Priority Priority, DateTimeOffset? DueAt);

public static class TodoApi
{
    static readonly List<Todo> Todos =
    [
        new(1, "Write the release notes", null, Priority.High, null),
        new(2, "Book the venue", "Ask for the room with windows", Priority.Normal, DateTimeOffset.Parse("2026-11-12T09:00:00Z")),
    ];

    public static void MapTodoApi(this WebApplication app)
    {
        var todos = app.MapGroup("/todos").WithTags("Todos");

        todos.MapGet("/", () => Todos).WithName("ListTodos");

        todos.MapGet("/{id:int}", Results<Ok<Todo>, NotFound> (int id) =>
            Todos.FirstOrDefault(t => t.Id == id) is { } todo ? TypedResults.Ok(todo) : TypedResults.NotFound())
            .WithName("GetTodo");

        todos.MapPost("/", (CreateTodo input) =>
        {
            var todo = new Todo(Todos.Count + 1, input.Title, input.Notes, input.Priority, input.DueAt);
            Todos.Add(todo);
            return TypedResults.Created($"/todos/{todo.Id}", todo);
        }).WithName("CreateTodo");

        todos.MapPost("/{id:int}/attachment", (int id, IFormFile file) =>
            TypedResults.Ok(new { id, file.FileName, file.Length }))
            .WithName("UploadAttachment")
            .DisableAntiforgery();
    }
}
