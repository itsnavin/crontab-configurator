#define MAIN_PROGRAM
#include "cron.h"

static int parse_failed = 0;

static void parser_error(char *message) {
  fprintf(stderr, "Ubuntu parser: %s\n", message);
  parse_failed = 1;
}

static void json_string(const char *value) {
  const unsigned char *p = (const unsigned char *)(value ? value : "");
  putchar('"');
  for (; *p; p++) {
    if (*p == '"' || *p == '\\') putchar('\\');
    if (*p < 32) printf("\\u%04x", *p);
    else putchar(*p);
  }
  putchar('"');
}

static void json_bits(bitstr_t *bits, int first, int last) {
  int comma = 0;
  putchar('[');
  for (int i = first; i <= last; i++) {
    if (bit_test(bits, i - first)) {
      printf("%s%d", comma ? "," : "", i);
      comma = 1;
    }
  }
  putchar(']');
}

int main(int argc, char **argv) {
  if (argc != 2 || (strcmp(argv[1], "user") && strcmp(argv[1], "system"))) return 2;
  /* Only parser objects are linked. No scheduler, job runner or shell exists here. */
  FILE *input = tmpfile();
  if (!input) { perror("tmpfile"); return 2; }
  int ch;
  while ((ch = getchar()) != EOF) fputc(ch, input);
  rewind(input);
  ProgramName = "ubuntu-parser-fixture";
  change_child_path = 1;
  char **env = env_init();
  if (!env) return 2;
  char setting[MAX_ENVSTR];
  int status;
  entry *e = NULL;
  while ((status = load_env(setting, input)) != ERR) {
    if (status == TRUE) {
      char **next = env_set(env, setting);
      if (!next) return 2;
      env = next;
    } else {
      if (e) { fprintf(stderr, "Fixture accepts exactly one job\n"); return 2; }
      struct passwd *pw = !strcmp(argv[1], "user") ? getpwnam("nobody") : NULL;
      if (!strcmp(argv[1], "user") && !pw) { fprintf(stderr, "Fixture needs the nobody account\n"); return 2; }
      e = load_entry(input, parser_error, pw, env);
      if (!e || parse_failed) return 1;
    }
  }
  if (!e) { fprintf(stderr, "No complete entry (final newline required)\n"); return 1; }
  printf("{\"flags\":%d,\"fields\":[", e->flags);
  json_bits(e->minute, FIRST_MINUTE, LAST_MINUTE); putchar(',');
  json_bits(e->hour, FIRST_HOUR, LAST_HOUR); putchar(',');
  json_bits(e->dom, FIRST_DOM, LAST_DOM); putchar(',');
  json_bits(e->month, FIRST_MONTH, LAST_MONTH); putchar(',');
  json_bits(e->dow, FIRST_DOW, LAST_DOW); putchar(']');
  printf(",\"command\":"); json_string(e->cmd);
  printf(",\"shell\":"); json_string(env_get("SHELL", e->envp));
  printf(",\"path\":"); json_string(env_get("PATH", e->envp));
  printf("}\n");
  free_entry(e);
  env_free(env);
  fclose(input);
  return 0;
}
