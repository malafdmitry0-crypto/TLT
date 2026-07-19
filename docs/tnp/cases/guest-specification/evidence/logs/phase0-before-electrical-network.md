156. [GET] http://localhost:8000/api/v1/projects/d204424b-793f-408a-8b69-b716131358d4/objects/summary => [401] Unauthorized
157. [GET] http://localhost:8000/api/v1/calc/electrical/query-capabilities?project_id=d204424b-793f-408a-8b69-b716131358d4&variant_number=1 => [401] Unauthorized
158. [GET] http://localhost:8000/api/v1/references/cables?source=builtin&cable_type=self_regulating => [401] Unauthorized
159. [POST] http://localhost:8000/api/v1/auth/guest => [201] Created
160. [GET] http://localhost:8000/api/v1/projects/eb40a46f-a75c-4f60-bb7e-b2cf22288a0b/objects/summary => [200] OK
161. [GET] http://localhost:8000/api/v1/calc/electrical/query-capabilities?project_id=eb40a46f-a75c-4f60-bb7e-b2cf22288a0b&variant_number=1 => [200] OK
162. [GET] http://localhost:8000/api/v1/references/cables?source=builtin&cable_type=self_regulating => [200] OK
163. [GET] http://localhost:8000/api/v1/calc/electrical/query-capabilities?project_id=d204424b-793f-408a-8b69-b716131358d4&variant_number=1 => [404] Not Found
164. [GET] http://localhost:8000/api/v1/projects/d204424b-793f-408a-8b69-b716131358d4/objects/summary => [404] Not Found
165. [POST] http://localhost:8000/api/v1/calc/electrical/query => [200] OK

Note: 155 static requests not shown, run with "static" option to see them.